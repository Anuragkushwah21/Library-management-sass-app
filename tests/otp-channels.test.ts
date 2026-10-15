import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getOtpChannel, OtpConfigError } from '@/lib/otp/channels';

const KEYS = [
  'OTP_CHANNEL', 'ALLOW_CONSOLE_OTP', 'OTP_SMS_TEMPLATE',
  'MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID', 'MSG91_OTP_VAR',
  'FAST2SMS_API_KEY', 'TWOFACTOR_API_KEY', 'TWOFACTOR_TEMPLATE',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM', 'TWILIO_MESSAGING_SERVICE_SID',
  'OTP_WEBHOOK_URL', 'OTP_WEBHOOK_METHOD', 'OTP_WEBHOOK_HEADERS', 'OTP_WEBHOOK_BODY', 'OTP_WEBHOOK_SUCCESS_TEXT',
];

let fetchMock: ReturnType<typeof vi.fn>;
const setEnv = (vars: Record<string, string>) => Object.assign(process.env, vars);
const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), init: init as RequestInit };
};

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
  fetchMock = vi.fn(async () => new Response('{"type":"success","return":true,"Status":"Success"}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('provider selection', () => {
  it('falls back to console when nothing is configured', () => {
    expect(getOtpChannel().name).toBe('console');
  });
  it('auto-detects from the keys that are set', () => {
    setEnv({ FAST2SMS_API_KEY: 'k' });
    expect(getOtpChannel().name).toBe('fast2sms');
  });
  it('OTP_CHANNEL wins over auto-detect', () => {
    setEnv({ FAST2SMS_API_KEY: 'k', OTP_CHANNEL: 'twilio', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM: '+1555' });
    expect(getOtpChannel().name).toBe('twilio');
  });
  it('reports missing keys before any code is generated', () => {
    setEnv({ OTP_CHANNEL: 'msg91', MSG91_AUTH_KEY: 'k' });
    expect(() => getOtpChannel()).toThrow(/MSG91_TEMPLATE_ID/);
    expect(() => getOtpChannel()).toThrow(OtpConfigError);
  });
  it('rejects unknown providers', () => {
    setEnv({ OTP_CHANNEL: 'pigeon' });
    expect(() => getOtpChannel()).toThrow(/Unknown OTP_CHANNEL/);
  });
});

describe('request shape per provider', () => {
  it('msg91', async () => {
    setEnv({ OTP_CHANNEL: 'msg91', MSG91_AUTH_KEY: 'AUTH', MSG91_TEMPLATE_ID: 'TPL' });
    await getOtpChannel().send('+919876543210', '123456', 'Lib');
    const { url, init } = lastCall();
    expect(url).toBe('https://control.msg91.com/api/v5/flow');
    expect((init.headers as any).authkey).toBe('AUTH');
    expect(JSON.parse(init.body as string)).toMatchObject({ template_id: 'TPL', recipients: [{ mobiles: '919876543210', otp: '123456' }] });
  });

  it('msg91 treats a 200 {"type":"error"} as a failure', async () => {
    setEnv({ OTP_CHANNEL: 'msg91', MSG91_AUTH_KEY: 'A', MSG91_TEMPLATE_ID: 'T' });
    fetchMock.mockResolvedValueOnce(new Response('{"type":"error","message":"bad template"}', { status: 200 }));
    await expect(getOtpChannel().send('+919876543210', '1', 'L')).rejects.toThrow(/bad template/);
  });

  it('fast2sms sends the 10-digit number and refuses non-Indian numbers', async () => {
    setEnv({ OTP_CHANNEL: 'fast2sms', FAST2SMS_API_KEY: 'KEY' });
    await getOtpChannel().send('+919876543210', '654321', 'Lib');
    const { url, init } = lastCall();
    expect(url).toBe('https://www.fast2sms.com/dev/bulkV2');
    expect((init.headers as any).authorization).toBe('KEY');
    expect(JSON.parse(init.body as string)).toEqual({ route: 'otp', variables_values: '654321', numbers: '9876543210' });
    await expect(getOtpChannel().send('+14155550100', '1', 'L')).rejects.toThrow(/Indian/);
  });

  it('2factor puts key, phone and code in the URL', async () => {
    setEnv({ OTP_CHANNEL: '2factor', TWOFACTOR_API_KEY: 'abc-123', TWOFACTOR_TEMPLATE: 'LibOTP' });
    await getOtpChannel().send('+919876543210', '111222', 'Lib');
    expect(lastCall().url).toBe('https://2factor.in/API/V1/abc-123/SMS/919876543210/111222/LibOTP');
  });

  it('twilio posts a form with basic auth and the message text', async () => {
    setEnv({ OTP_CHANNEL: 'twilio', TWILIO_ACCOUNT_SID: 'AC9', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15550001111' });
    await getOtpChannel().send('+919876543210', '999000', "Ravi's Library");
    const { url, init } = lastCall();
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC9/Messages.json');
    expect((init.headers as any).authorization).toBe(`Basic ${Buffer.from('AC9:tok').toString('base64')}`);
    const form = new URLSearchParams(init.body as string);
    expect(form.get('To')).toBe('+919876543210');
    expect(form.get('From')).toBe('+15550001111');
    expect(form.get('Body')).toContain('999000');
    expect(form.get('Body')).toContain("Ravi's Library");
  });

  it('webhook fills placeholders in URL, headers and JSON body', async () => {
    setEnv({
      OTP_CHANNEL: 'webhook',
      OTP_WEBHOOK_URL: 'https://sms.example.com/send?to={{phone_digits}}',
      OTP_WEBHOOK_HEADERS: '{"Authorization":"Bearer SECRET"}',
      OTP_WEBHOOK_BODY: '{"mobile":"{{phone_national}}","text":"{{message}}"}',
      OTP_SMS_TEMPLATE: 'Code {{code}} for "{{library}}"',
      OTP_WEBHOOK_SUCCESS_TEXT: 'Success',
    });
    await getOtpChannel().send('+919876543210', '424242', 'Lib One');
    const { url, init } = lastCall();
    expect(url).toBe('https://sms.example.com/send?to=919876543210');
    expect((init.headers as any).Authorization).toBe('Bearer SECRET');
    // quotes inside the message are JSON-escaped, so the body stays valid JSON
    expect(JSON.parse(init.body as string)).toEqual({ mobile: '9876543210', text: 'Code 424242 for "Lib One"' });
  });

  it('webhook fails when the success text is missing', async () => {
    setEnv({ OTP_CHANNEL: 'webhook', OTP_WEBHOOK_URL: 'https://x.test', OTP_WEBHOOK_SUCCESS_TEXT: 'queued' });
    fetchMock.mockResolvedValueOnce(new Response('{"error":"no credit"}', { status: 200 }));
    await expect(getOtpChannel().send('+919876543210', '1', 'L')).rejects.toThrow(/no credit/);
  });

  it('HTTP errors surface the provider response', async () => {
    setEnv({ OTP_CHANNEL: 'fast2sms', FAST2SMS_API_KEY: 'bad' });
    fetchMock.mockResolvedValueOnce(new Response('{"message":"Invalid Authentication"}', { status: 401 }));
    await expect(getOtpChannel().send('+919876543210', '1', 'L')).rejects.toThrow(/401.*Invalid Authentication/);
  });
});

describe('test mode (free testing)', () => {
  const ORIGINAL = process.env.NODE_ENV;
  afterEach(() => {
    (process.env as any).NODE_ENV = ORIGINAL;
    delete process.env.OTP_TEST_MODE;
  });

  it('production refuses console unless test mode is on, then shows the code', async () => {
    const { exposeDevCode } = await import('@/lib/otp/channels');
    (process.env as any).NODE_ENV = 'production';
    expect(() => getOtpChannel()).toThrow(/not configured/);
    process.env.OTP_TEST_MODE = 'true';
    const ch = getOtpChannel();
    expect(ch.name).toBe('console');
    expect(exposeDevCode(ch)).toBe(true);
  });

  it('never shows the code when a real provider is set', async () => {
    const { exposeDevCode } = await import('@/lib/otp/channels');
    process.env.OTP_TEST_MODE = 'true';
    setEnv({ OTP_CHANNEL: 'fast2sms', FAST2SMS_API_KEY: 'k' });
    expect(exposeDevCode(getOtpChannel())).toBe(false);
  });
});
