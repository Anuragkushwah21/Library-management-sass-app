// lib/otp/channels.ts — how a student OTP reaches the phone (PLAN D1)
//
// Pick a provider with OTP_CHANNEL in .env; nothing in the code changes:
//
//   console   dev only — prints the code in the server terminal
//   msg91     MSG91 Flow API          (India, DLT template)
//   fast2sms  Fast2SMS OTP route      (India, no DLT template of your own)
//   2factor   2Factor.in SMS OTP      (India)
//   twilio    Twilio Messages API     (worldwide)
//   webhook   any other HTTP SMS API, configured entirely from .env
//
// Leave OTP_CHANNEL empty to auto-pick the first provider whose keys are set,
// falling back to console. See .env.example for every variable.

export type OtpChannelName = 'console' | 'msg91' | 'fast2sms' | '2factor' | 'twilio' | 'webhook';

export interface OtpChannel {
  name: OtpChannelName;
  /** Throws OtpConfigError when .env is incomplete — run before a code is created */
  check?(): void;
  send(phoneE164: string, code: string, libraryName: string): Promise<void>;
}

/** Thrown for missing/invalid configuration (vs. a provider failing at send time). */
export class OtpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpConfigError';
  }
}

const TIMEOUT_MS = 10_000;
const env = (k: string) => process.env[k]?.trim() || '';

function requireEnv(channel: string, keys: string[]): Record<string, string> {
  const missing = keys.filter((k) => !env(k));
  if (missing.length) {
    throw new OtpConfigError(`OTP_CHANNEL=${channel} needs ${missing.join(', ')} in .env`);
  }
  return Object.fromEntries(keys.map((k) => [k, env(k)]));
}

/** "+919876543210" → "919876543210" */
const digitsOnly = (e164: string) => e164.replace(/\D/g, '');
/** "+919876543210" → "9876543210" (Indian 10-digit; other countries keep their digits) */
const national = (e164: string) => (e164.startsWith('+91') ? e164.slice(3) : digitsOnly(e164));

/** Free-text SMS body (Twilio, webhook). DLT providers use their own approved template. */
export function otpMessage(code: string, libraryName: string): string {
  const template = env('OTP_SMS_TEMPLATE') || '{{code}} is your {{library}} check-in code. Valid for 5 minutes. Do not share it.';
  return fill(template, { code, library: libraryName, phone: '' });
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

async function request(name: string, url: string, init: RequestInit): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err: any) {
    throw new Error(`${name}: request failed (${err?.name === 'TimeoutError' ? 'timed out' : err?.message})`);
  }
  const body = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`${name} ${res.status}: ${body.slice(0, 300)}`);
  return body;
}

/* ───────────── providers ───────────── */

const consoleChannel: OtpChannel = {
  name: 'console',
  async send(phone, code, libraryName) {
    console.log(`\n[OTP] ${libraryName} → ${phone}: ${code}\n`);
  },
};

/** MSG91 Flow API. Needs a DLT-approved template whose OTP variable is MSG91_OTP_VAR (default "otp"). */
const msg91: OtpChannel = {
  name: 'msg91',
  check: () => void requireEnv('msg91', ['MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID']),
  async send(phone, code) {
    const c = requireEnv('msg91', ['MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID']);
    const body = await request('MSG91', 'https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: { authkey: c.MSG91_AUTH_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        template_id: c.MSG91_TEMPLATE_ID,
        short_url: '0',
        recipients: [{ mobiles: digitsOnly(phone), [env('MSG91_OTP_VAR') || 'otp']: code }],
      }),
    });
    // MSG91 can answer 200 with {"type":"error"}
    if (/"type"\s*:\s*"error"/.test(body)) throw new Error(`MSG91: ${body.slice(0, 300)}`);
  },
};

/** Fast2SMS "OTP" route — Indian numbers only; uses Fast2SMS's own OTP text. */
const fast2sms: OtpChannel = {
  name: 'fast2sms',
  check: () => void requireEnv('fast2sms', ['FAST2SMS_API_KEY']),
  async send(phone, code) {
    const c = requireEnv('fast2sms', ['FAST2SMS_API_KEY']);
    if (!phone.startsWith('+91')) throw new Error('Fast2SMS only delivers to Indian (+91) numbers.');
    const body = await request('Fast2SMS', 'https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: { authorization: c.FAST2SMS_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ route: 'otp', variables_values: code, numbers: national(phone) }),
    });
    if (/"return"\s*:\s*false/.test(body)) throw new Error(`Fast2SMS: ${body.slice(0, 300)}`);
  },
};

/** 2Factor.in SMS OTP. TWOFACTOR_TEMPLATE is the optional template name from their dashboard. */
const twoFactor: OtpChannel = {
  name: '2factor',
  check: () => void requireEnv('2factor', ['TWOFACTOR_API_KEY']),
  async send(phone, code) {
    const c = requireEnv('2factor', ['TWOFACTOR_API_KEY']);
    const template = env('TWOFACTOR_TEMPLATE');
    const url =
      `https://2factor.in/API/V1/${encodeURIComponent(c.TWOFACTOR_API_KEY)}/SMS/` +
      `${encodeURIComponent(digitsOnly(phone))}/${code}` +
      (template ? `/${encodeURIComponent(template)}` : '');
    const body = await request('2Factor', url, { method: 'GET' });
    if (!/"Status"\s*:\s*"Success"/i.test(body)) throw new Error(`2Factor: ${body.slice(0, 300)}`);
  },
};

/** Twilio. Set TWILIO_FROM (a Twilio number) or TWILIO_MESSAGING_SERVICE_SID. */
const twilio: OtpChannel = {
  name: 'twilio',
  check() {
    requireEnv('twilio', ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']);
    if (!env('TWILIO_FROM') && !env('TWILIO_MESSAGING_SERVICE_SID')) {
      throw new OtpConfigError('OTP_CHANNEL=twilio needs TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID in .env');
    }
  },
  async send(phone, code, libraryName) {
    const c = requireEnv('twilio', ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']);
    const from = env('TWILIO_FROM');
    const service = env('TWILIO_MESSAGING_SERVICE_SID');
    const form = new URLSearchParams({ To: phone, Body: otpMessage(code, libraryName) });
    if (service) form.set('MessagingServiceSid', service);
    else form.set('From', from);
    await request('Twilio', `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.TWILIO_ACCOUNT_SID)}/Messages.json`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${c.TWILIO_ACCOUNT_SID}:${c.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
  },
};

/**
 * Any other SMS API, described in .env. Placeholders in the URL, headers and
 * body: {{phone}} (+91…), {{phone_digits}} (91…), {{phone_national}} (98…),
 * {{code}}, {{message}}, {{library}}.
 */
const webhook: OtpChannel = {
  name: 'webhook',
  check() {
    requireEnv('webhook', ['OTP_WEBHOOK_URL']);
    if (env('OTP_WEBHOOK_HEADERS')) {
      try {
        JSON.parse(env('OTP_WEBHOOK_HEADERS'));
      } catch {
        throw new OtpConfigError('OTP_WEBHOOK_HEADERS must be valid JSON, e.g. {"Authorization":"Bearer xyz"}');
      }
    }
  },
  async send(phone, code, libraryName) {
    const c = requireEnv('webhook', ['OTP_WEBHOOK_URL']);
    const vars = {
      phone,
      phone_digits: digitsOnly(phone),
      phone_national: national(phone),
      code,
      library: libraryName,
      message: otpMessage(code, libraryName),
    };
    // Values are URL-encoded in the URL and JSON-escaped in the body
    const url = fill(c.OTP_WEBHOOK_URL, Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, encodeURIComponent(v)])));
    const method = (env('OTP_WEBHOOK_METHOD') || 'POST').toUpperCase();

    let headers: Record<string, string> = {};
    if (env('OTP_WEBHOOK_HEADERS')) {
      try {
        headers = JSON.parse(fill(env('OTP_WEBHOOK_HEADERS'), vars));
      } catch {
        throw new OtpConfigError('OTP_WEBHOOK_HEADERS must be valid JSON, e.g. {"Authorization":"Bearer xyz"}');
      }
    }
    const bodyTemplate = env('OTP_WEBHOOK_BODY');
    const body =
      method === 'GET' || !bodyTemplate
        ? undefined
        : fill(bodyTemplate, Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, JSON.stringify(v).slice(1, -1)])));
    if (body && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
      headers['content-type'] = 'application/json';
    }

    const res = await request('OTP webhook', url, { method, headers, body });
    const mustContain = env('OTP_WEBHOOK_SUCCESS_TEXT');
    if (mustContain && !res.includes(mustContain)) {
      throw new Error(`OTP webhook: response did not contain "${mustContain}": ${res.slice(0, 300)}`);
    }
  },
};

const CHANNELS: Record<OtpChannelName, OtpChannel> = {
  console: consoleChannel,
  msg91,
  fast2sms,
  '2factor': twoFactor,
  twilio,
  webhook,
};

/** First provider whose main key is present — used when OTP_CHANNEL is empty. */
function autoDetect(): OtpChannelName {
  if (env('MSG91_AUTH_KEY')) return 'msg91';
  if (env('FAST2SMS_API_KEY')) return 'fast2sms';
  if (env('TWOFACTOR_API_KEY')) return '2factor';
  if (env('TWILIO_ACCOUNT_SID')) return 'twilio';
  if (env('OTP_WEBHOOK_URL')) return 'webhook';
  return 'console';
}

export function getOtpChannel(): OtpChannel {
  const configured = env('OTP_CHANNEL').toLowerCase();
  const name = (configured || autoDetect()) as OtpChannelName;
  const channel = CHANNELS[name];
  if (!channel) {
    throw new OtpConfigError(
      `Unknown OTP_CHANNEL "${configured}". Use one of: ${Object.keys(CHANNELS).join(', ')}.`
    );
  }
  if (
    name === 'console' &&
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_CONSOLE_OTP !== 'true' &&
    !isOtpTestMode()
  ) {
    throw new OtpConfigError(
      'SMS is not configured. Set OTP_CHANNEL and that provider’s keys in .env (or ALLOW_CONSOLE_OTP=true for testing).'
    );
  }
  channel.check?.();
  return channel;
}

/**
 * Show the code on screen instead of texting it. Always on for local dev with
 * the console channel; on a deployed site only with OTP_TEST_MODE=true — a free
 * way to test on real phones before paying for SMS. Never with a real provider.
 */
export function exposeDevCode(channel: OtpChannel): boolean {
  if (channel.name !== 'console') return false;
  return process.env.NODE_ENV !== 'production' || isOtpTestMode();
}

export function isOtpTestMode(): boolean {
  return env('OTP_TEST_MODE').toLowerCase() === 'true';
}
