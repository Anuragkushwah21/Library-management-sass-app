// lib/email-service.ts
import { Resend } from 'resend';
import nodemailer, { type Transporter } from 'nodemailer';
import { randomInt } from 'crypto';

interface EmailTemplateParams {
  recipientEmail: string;
  recipientName: string;
  [key: string]: any;
}

interface OTPEmailParams extends EmailTemplateParams {
  otp: string;
  expiryMinutes?: number;
}

interface WelcomeEmailParams extends EmailTemplateParams {
  libraryName: string;
  loginUrl: string;
}

interface MembershipReminderParams extends EmailTemplateParams {
  libraryName: string;
  daysLeft: number;
}

// ---------- PROVIDERS ----------

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export type EmailProvider = 'smtp' | 'resend';

/**
 * Two providers are supported, because their use cases differ:
 *
 * - `smtp`   — a relay like Brevo or Gmail. These only need a single sender
 *              EMAIL verified, not a whole domain, so you can reach real users
 *              without buying one.
 * - `resend` — API based. Better deliverability, but needs a verified DOMAIN
 *              before it will deliver to recipients.
 *
 * Auto-detect: smtp if SMTP_HOST is set, otherwise resend.
 * Override with `EMAIL_PROVIDER`.
 */
export function getEmailProvider(): EmailProvider {
  const explicit = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (explicit === 'smtp' || explicit === 'resend') return explicit;
  return process.env.SMTP_HOST ? 'smtp' : 'resend';
}

// Lazy init — build time par env na ho to crash na ho
let resendClient: Resend | null = null;
let smtpTransporter: Transporter | null = null;

function getResend(): Resend | null {
  if (resendClient) return resendClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  resendClient = new Resend(apiKey);
  return resendClient;
}

function getTransporter(): Transporter | null {
  if (smtpTransporter) return smtpTransporter;

  const host = process.env.SMTP_HOST;
  if (!host) return null;

  const port = Number(process.env.SMTP_PORT || 587);

  smtpTransporter = nodemailer.createTransport({
    host,
    port,
    // 465 uses implicit TLS, 587 uses STARTTLS. With no explicit env, infer
    // it from the port — getting this wrong is a very common mistake.
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === 'true'
      : port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  return smtpTransporter;
}

export function getFromEmail(): string {
  return (
    process.env.EMAIL_FROM ||
    process.env.SMTP_FROM_EMAIL ||
    process.env.SMTP_USER ||
    'onboarding@resend.dev'
  );
}

/**
 * The display name matters for deliverability — spam filters penalise
 * unspaced, misspelt names like "LibratyManagement".
 * Override with EMAIL_FROM_NAME.
 */
export function getFromName(): string {
  return (
    process.env.EMAIL_FROM_NAME ||
    process.env.LIBRARY_NAME ||
    'Library Management System'
  );
}

function getFromAddress(): string {
  const from = getFromEmail();
  return from.includes('<') ? from : `${getFromName()} <${from}>`;
}

/** Check whether credentials are valid, without sending a real email. */
export async function verifyEmailConfig(): Promise<SendResult> {
  const provider = getEmailProvider();

  if (provider === 'smtp') {
    const transporter = getTransporter();
    if (!transporter) {
      return { success: false, error: 'SMTP_HOST is not set.' };
    }
    try {
      await transporter.verify();
      return { success: true };
    } catch (err) {
      return { success: false, error: describeSmtpError(err) };
    }
  }

  return getResend()
    ? { success: true }
    : { success: false, error: 'RESEND_API_KEY is not set.' };
}

/**
 * Turn Resend's raw errors into actionable messages. The most common trap:
 * the `onboarding@resend.dev` test sender only delivers to the account owner —
 * every other recipient returns 403. Without this hint the bug eats hours,
 * because the API looks like a 200 everywhere else.
 */
function describeResendError(error: { name?: string; message?: string }): string {
  const message = error.message || 'Unknown Resend error';

  if (/only send testing emails/i.test(message)) {
    return (
      `${message} — EMAIL_FROM is currently "${process.env.EMAIL_FROM}". ` +
      'To reach real users, verify a domain at resend.com/domains and set ' +
      'EMAIL_FROM to an address on that domain.'
    );
  }

  if (/domain is not verified/i.test(message)) {
    return `${message} — the domain of EMAIL_FROM ("${process.env.EMAIL_FROM}") is not verified in Resend.`;
  }

  return `${error.name || 'error'}: ${message}`;
}

/** Attach an actionable hint to SMTP errors. */
function describeSmtpError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; message?: string };
  const message = e?.message || 'SMTP error';

  if (e?.code === 'EAUTH' || e?.responseCode === 535) {
    return (
      `${message} — SMTP_USER/SMTP_PASSWORD were rejected. ` +
      'For Gmail, 2-Step Verification must be ON and you need an App Password, ' +
      'not your normal password. For Brevo, use the SMTP key, not the login ' +
      'password.'
    );
  }

  if (e?.responseCode === 553 || e?.responseCode === 555) {
    return (
      `${message} — not allowed to send as "${getFromAddress()}". ` +
      'The From address must match a verified sender in your provider.'
    );
  }

  if (e?.code === 'ECONNECTION' || e?.code === 'ETIMEDOUT') {
    return `${message} — could not connect to SMTP_HOST/SMTP_PORT.`;
  }

  return message;
}

// Common send helper — dispatches based on the configured provider
async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const provider = getEmailProvider();

  if (provider === 'smtp') {
    const transporter = getTransporter();

    if (!transporter) {
      const message = 'SMTP_HOST is not set — email not sent.';
      console.error('[LibraSaaS]', message);
      return { success: false, error: message };
    }

    try {
      const info = await transporter.sendMail({
        from: getFromAddress(),
        to,
        subject,
        html,
        text,
        // A Reply-To is a legitimacy signal — without it, filters see mail
        // nobody can reply to, which is a bulk/spam pattern
        replyTo: getFromEmail(),
      });
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error('[LibraSaaS] SMTP error:', err);
      return { success: false, error: describeSmtpError(err) };
    }
  }

  const resend = getResend();

  if (!resend) {
    const message = 'RESEND_API_KEY is not set — email not sent.';
    console.error('[LibraSaaS]', message);
    return { success: false, error: message };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to,
      subject,
      html,
      text,
      replyTo: getFromEmail(),
    });

    // Resend API errors don't throw — they come back in the response
    if (error) {
      console.error('[LibraSaaS] Resend error:', error);
      return { success: false, error: describeResendError(error) };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    console.error('[LibraSaaS] Resend request failed:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Email send failed',
    };
  }
}

// ---------- PUBLIC FUNCTIONS ----------

/**
 * Send OTP email for email verification / password reset
 */
export async function sendOTPEmail({
  recipientEmail,
  recipientName,
  otp,
  expiryMinutes = 10,
}: OTPEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const html = generateOTPEmailHTML(recipientName, otp, expiryMinutes);
  const text = generateOTPEmailText(recipientName, otp, expiryMinutes);

  const result = await sendEmail({
    to: recipientEmail,
    subject: `${otp} is your verification code`,
    html,
    text,
  });

  // In dev, also print the OTP to the console so development isn't blocked by
  // spam filtering or deliverability issues.
  // Never in production — that would leak OTPs into server logs.
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `\n  ┌─ DEV OTP ─────────────────────────────\n` +
        `  │  ${recipientEmail}\n` +
        `  │  code: ${otp}   (${expiryMinutes} min)\n` +
        `  │  email ${result.success ? 'sent ✓' : 'FAILED ✗ ' + result.error}\n` +
        `  └───────────────────────────────────────\n`
    );
  }

  return result;
}

/**
 * Send welcome email after registration
 */
export async function sendWelcomeEmail({
  recipientEmail,
  recipientName,
  libraryName,
  loginUrl,
}: WelcomeEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const html = generateWelcomeEmailHTML(recipientName, libraryName, loginUrl);
  const text = generateWelcomeEmailText(recipientName, libraryName, loginUrl);

  return await sendEmail({
    to: recipientEmail,
    subject: `Welcome to ${libraryName}`,
    html,
    text,
  });
}

/**
 * Send membership expiry reminder email
 */
export async function sendMembershipReminderEmail({
  recipientEmail,
  recipientName,
  libraryName,
  daysLeft,
}: MembershipReminderParams): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const html = generateMembershipReminderHTML(
    recipientName,
    libraryName,
    daysLeft
  );
  const text = generateMembershipReminderText(
    recipientName,
    libraryName,
    daysLeft
  );

  return await sendEmail({
    to: recipientEmail,
    subject: `Your ${libraryName} membership expires in ${daysLeft} day${
      daysLeft === 1 ? '' : 's'
    }`,
    html,
    text,
  });
}

/**
 * Offer / announcement email — used by a librarian to send promotional or
 * informational messages to their students.
 */
export interface OfferEmailParams {
  recipientEmail: string;
  recipientName: string;
  libraryName: string;
  /** Large banner text, e.g. "Diwali Special" */
  headline: string;
  /** Optional banner badge, e.g. "30% OFF" */
  badge?: string;
  /** Body message */
  message: string;
  /** Optional, e.g. "Valid till 31 Aug 2026" */
  validTill?: string;
  /** CTA button — only rendered when both are provided */
  ctaLabel?: string;
  ctaUrl?: string;
  subject: string;
}

export async function sendOfferEmail(
  params: OfferEmailParams
): Promise<SendResult> {
  return await sendEmail({
    to: params.recipientEmail,
    subject: params.subject,
    html: generateOfferEmailHTML(params),
    text: generateOfferEmailText(params),
  });
}

/** To admins: a new librarian is awaiting approval. */
export interface LibrarianPendingParams {
  adminEmail: string;
  adminName: string;
  librarian: {
    name: string;
    email: string;
    phone?: string;
    registeredAt: Date | string;
  };
  /** Review page ka signed link */
  reviewUrl: string;
}

export async function sendLibrarianPendingEmail(
  params: LibrarianPendingParams
): Promise<SendResult> {
  return await sendEmail({
    to: params.adminEmail,
    subject: `New librarian awaiting approval — ${params.librarian.name}`,
    html: generateLibrarianPendingHTML(params),
    text: generateLibrarianPendingText(params),
  });
}

/** To the librarian: your account was approved or rejected. */
export interface LibrarianDecisionParams {
  recipientEmail: string;
  recipientName: string;
  approved: boolean;
  reason?: string;
  loginUrl: string;
}

export async function sendLibrarianDecisionEmail(
  params: LibrarianDecisionParams
): Promise<SendResult> {
  return await sendEmail({
    to: params.recipientEmail,
    subject: params.approved
      ? 'Your librarian account has been approved'
      : 'Update on your librarian account application',
    html: generateLibrarianDecisionHTML(params),
    text: generateLibrarianDecisionText(params),
  });
}

// ---------- TEMPLATES ----------

function generateOTPEmailHTML(
  name: string,
  otp: string,
  expiryMinutes: number
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { background: #f9fafb; padding: 40px 20px; border-radius: 0 0 8px 8px; }
    .otp-box { background: white; border: 2px solid #8B5CF6; padding: 30px; text-align: center; border-radius: 8px; margin: 20px 0; }
    .otp-code { font-size: 48px; font-weight: bold; color: #8B5CF6; letter-spacing: 8px; font-family: 'Courier New', monospace; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; }
    .button { display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%); color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 20px; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; border-radius: 4px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>LibraSaaS</h1>
      <p>Email Verification</p>
    </div>
    
    <div class="content">
      <p>Hi ${name},</p>
      <p>Thank you for signing up to LibraSaaS! To verify your email address, please use the verification code below:</p>
      <div class="otp-box">
        <div class="otp-code">${otp}</div>
        <p style="color: #666; margin: 10px 0 0 0;">This code expires in ${expiryMinutes} minutes</p>
      </div>
      <p>If you didn't request this verification code, please ignore this email.</p>
      <div class="warning">
        <strong>Note:</strong> This code is for you only. Our team will never ask you for it.
      </div>
      <p>If you have any questions, please contact our support team.</p>
      <p>
        Best regards,<br>
        <strong>The LibraSaaS Team</strong>
      </p>
    </div>
    
    <div class="footer">
      <p>&copy; 2024 LibraSaaS. All rights reserved.</p>
      <p>This email was sent from ${
        process.env.NEXT_PUBLIC_APP_URL || 'https://librasaas.com'
      }</p>
    </div>
  </div>
</body>
</html>
  `;
}

function generateOTPEmailText(
  name: string,
  otp: string,
  expiryMinutes: number
): string {
  return `
LibraSaaS - Email Verification

Hi ${name},

Thank you for signing up to LibraSaaS! To verify your email address, please use the verification code below:

Verification Code: ${otp}
(Expires in ${expiryMinutes} minutes)

If you didn't request this verification code, please ignore this email.

SECURITY NOTICE: Never share this code with anyone. LibraSaaS support staff will never ask for this code.

If you have any questions, please contact our support team.

Best regards,
The LibraSaaS Team

---
Copyright © 2024 LibraSaaS. All rights reserved.
  `;
}

function generateWelcomeEmailHTML(
  name: string,
  libraryName: string,
  loginUrl: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 40px 20px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%); color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 20px 0; }
    .features { margin: 20px 0; }
    .feature-item { margin: 10px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to ${libraryName}! 🎉</h1>
    </div>
    
    <div class="content">
      <p>Hi ${name},</p>
      <p>Your LibraSaaS library account is now active! You're all set to start managing your library.</p>
      <h2 style="color: #8B5CF6;">Getting Started</h2>
      <div class="features">
        <div class="feature-item">✅ Add books to your inventory</div>
        <div class="feature-item">✅ Manage member accounts</div>
        <div class="feature-item">✅ Track book transactions</div>
        <div class="feature-item">✅ Monitor overdue books</div>
        <div class="feature-item">✅ Generate reports</div>
      </div>
      <p>
        <a href="${loginUrl}" class="button">Go to Your Dashboard</a>
      </p>
      <h2 style="color: #8B5CF6;">Need Help?</h2>
      <p>
        Check out our <a href="#">help documentation</a> or email us at support@librasaas.com
      </p>
      <p>
        Best regards,<br>
        <strong>The LibraSaaS Team</strong>
      </p>
    </div>
    
    <div class="footer">
      <p>&copy; 2024 LibraSaaS. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
}

function generateWelcomeEmailText(
  name: string,
  libraryName: string,
  loginUrl: string
): string {
  return `
Welcome to ${libraryName}!

Hi ${name},

Your LibraSaaS library account is now active! You're all set to start managing your library.

GETTING STARTED
===============
✅ Add books to your inventory
✅ Manage member accounts
✅ Track book transactions
✅ Monitor overdue books
✅ Generate reports

Login to your dashboard: ${loginUrl}

NEED HELP?
==========
Check out our help documentation or email us at support@librasaas.com

Best regards,
The LibraSaaS Team

---
Copyright © 2024 LibraSaaS. All rights reserved.
  `;
}

function generateMembershipReminderHTML(
  name: string,
  libraryName: string,
  daysLeft: number
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%); color: white; padding: 32px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 32px 20px; border-radius: 0 0 8px 8px; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${libraryName}</h1>
      <p>Membership Expiry Reminder</p>
    </div>

    <div class="content">
      <p>Hi ${name},</p>
      <p>
        This is a friendly reminder that your library membership will expire in
        <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong>.
      </p>
      <p>
        To avoid interruption in your access, please renew your membership before it expires.
      </p>
      <p>
        If you have already renewed, please ignore this message.
      </p>
      <p>
        Best regards,<br />
        <strong>The ${libraryName} Team</strong>
      </p>
    </div>

    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${libraryName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
}

function generateMembershipReminderText(
  name: string,
  libraryName: string,
  daysLeft: number
): string {
  return `
${libraryName} - Membership Expiry Reminder

Hi ${name},

This is a friendly reminder that your library membership will expire in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.

To avoid interruption in your access, please renew your membership before it expires.

If you have already renewed, please ignore this message.

Best regards,
The ${libraryName} Team
`;
}

// ---------- OTP helpers ----------

function generateLibrarianPendingHTML({
  adminName,
  librarian,
  reviewUrl,
}: LibrarianPendingParams): string {
  const registered = new Date(librarian.registeredAt).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 0;color:#6b7280;font-size:14px;width:110px;">${label}</td>
      <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:500;">${escapeHtml(
        value
      )}</td>
    </tr>`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">

        <tr>
          <td style="background:linear-gradient(135deg,#8B5CF6 0%,#3B82F6 100%);padding:32px 24px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">New Librarian Registration</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Approval required</p>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 24px;">
            <p style="margin:0 0 18px;font-size:15px;color:#111827;">Hi ${escapeHtml(
              adminName
            )},</p>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">
              A new librarian has verified their email and is waiting for your approval.
            </p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:14px 16px;margin-bottom:24px;">
              ${row('Name', librarian.name)}
              ${row('Email', librarian.email)}
              ${librarian.phone ? row('Phone', librarian.phone) : ''}
              ${row('Registered', registered)}
            </table>

            <div style="text-align:center;">
              <a href="${escapeHtml(reviewUrl)}"
                 style="display:inline-block;background:linear-gradient(135deg,#8B5CF6 0%,#3B82F6 100%);color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 32px;border-radius:8px;">
                Review Application
              </a>
            </div>

            <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center;">
              You can approve or reject from there. The link expires in 7 days —
              after that, use the admin dashboard.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="margin:0;font-size:12px;color:#6b7280;">
              You are receiving this because you are an administrator.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function generateLibrarianPendingText({
  adminName,
  librarian,
  reviewUrl,
}: LibrarianPendingParams): string {
  return [
    'New Librarian Registration — Approval Required',
    '',
    `Hi ${adminName},`,
    '',
    'A new librarian has verified their email and is waiting for your approval.',
    '',
    `Name       : ${librarian.name}`,
    `Email      : ${librarian.email}`,
    librarian.phone ? `Phone      : ${librarian.phone}` : null,
    `Registered : ${new Date(librarian.registeredAt).toLocaleString('en-IN')}`,
    '',
    `Review: ${reviewUrl}`,
    '',
    'This link expires in 7 days. After that, approve or reject from the admin dashboard.',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

function generateLibrarianDecisionHTML({
  recipientName,
  approved,
  reason,
  loginUrl,
}: LibrarianDecisionParams): string {
  const accent = approved ? '#10b981' : '#ef4444';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">

        <tr>
          <td style="background:${accent};padding:32px 24px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">
              ${approved ? 'Account Approved' : 'Application Not Approved'}
            </h1>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 24px;">
            <p style="margin:0 0 16px;font-size:15px;color:#111827;">Hi ${escapeHtml(
              recipientName
            )},</p>

            ${
              approved
                ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
                     Good news — your librarian account has been approved.
                     You can now sign in and start managing your library.
                   </p>
                   <div style="text-align:center;margin-top:24px;">
                     <a href="${escapeHtml(loginUrl)}"
                        style="display:inline-block;background:${accent};color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 32px;border-radius:8px;">
                       Login to Dashboard
                     </a>
                   </div>`
                : `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#374151;">
                     Your librarian account request was not approved this time.
                   </p>
                   ${
                     reason
                       ? `<table role="presentation" width="100%" style="background:#fef2f2;border-left:4px solid ${accent};border-radius:4px;">
                            <tr><td style="padding:12px 14px;font-size:14px;color:#374151;">
                              <strong>Reason:</strong> ${escapeHtml(reason)}
                            </td></tr>
                          </table>`
                       : ''
                   }
                   <p style="margin:20px 0 0;font-size:15px;line-height:1.7;color:#374151;">
                     If you think this was a mistake, please contact the administrator.
                   </p>`
            }
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function generateLibrarianDecisionText({
  recipientName,
  approved,
  reason,
  loginUrl,
}: LibrarianDecisionParams): string {
  return [
    approved ? 'Account Approved' : 'Application Not Approved',
    '',
    `Hi ${recipientName},`,
    '',
    approved
      ? 'Your librarian account has been approved. You can now sign in.'
      : 'Your librarian account request was not approved this time.',
    !approved && reason ? `\nReason: ${reason}` : null,
    approved ? `\nLogin: ${loginUrl}` : null,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/** Prevents HTML injection — user text goes straight into the template. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateOfferEmailHTML({
  recipientName,
  libraryName,
  headline,
  badge,
  message,
  validTill,
  ctaLabel,
  ctaUrl,
}: OfferEmailParams): string {
  const safeName = escapeHtml(recipientName);
  const safeLibrary = escapeHtml(libraryName);
  const safeHeadline = escapeHtml(headline);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

  // Only render the CTA when there is a label and a safe http(s) URL
  const safeCta =
    ctaLabel && ctaUrl && /^https?:\/\//i.test(ctaUrl)
      ? { label: escapeHtml(ctaLabel), url: escapeHtml(ctaUrl) }
      : null;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <!-- flex/grid is unreliable in email clients, so tables + inline styles -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

          <!-- OFFER BANNER -->
          <tr>
            <td style="background:linear-gradient(135deg,#8B5CF6 0%,#3B82F6 100%);padding:40px 24px;text-align:center;">
              ${
                badge
                  ? `<div style="display:inline-block;background:rgba(255,255,255,0.22);color:#ffffff;font-size:13px;font-weight:700;letter-spacing:1px;padding:6px 16px;border-radius:999px;margin-bottom:14px;">${escapeHtml(
                      badge
                    )}</div>`
                  : ''
              }
              <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.25;font-weight:800;">${safeHeadline}</h1>
              ${
                validTill
                  ? `<p style="margin:14px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Valid till ${escapeHtml(
                      validTill
                    )}</p>`
                  : ''
              }
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 16px;font-size:16px;color:#111827;">Hi ${safeName},</p>
              <div style="margin:0;font-size:15px;line-height:1.7;color:#374151;">${safeMessage}</div>

              ${
                safeCta
                  ? `<div style="text-align:center;margin-top:28px;">
                       <a href="${safeCta.url}" style="display:inline-block;background:linear-gradient(135deg,#8B5CF6 0%,#3B82F6 100%);color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 30px;border-radius:8px;">${safeCta.label}</a>
                     </div>`
                  : ''
              }

              <p style="margin:28px 0 0;font-size:15px;color:#374151;">
                Regards,<br><strong>${safeLibrary}</strong>
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:18px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:12px;color:#6b7280;">
                You are receiving this because you are a member of ${safeLibrary}.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function generateOfferEmailText({
  recipientName,
  libraryName,
  headline,
  badge,
  message,
  validTill,
  ctaLabel,
  ctaUrl,
}: OfferEmailParams): string {
  const lines = [
    badge ? `[${badge}]` : null,
    headline,
    '='.repeat(Math.min(headline.length, 50)),
    '',
    `Hi ${recipientName},`,
    '',
    message,
    '',
    validTill ? `Valid till ${validTill}` : null,
    ctaLabel && ctaUrl ? `${ctaLabel}: ${ctaUrl}` : null,
    '',
    'Regards,',
    libraryName,
    '',
    `You are receiving this because you are a member of ${libraryName}.`,
  ];

  return lines.filter((l) => l !== null).join('\n');
}

export function generateOTP(length: number = 6): string {
  // Math.random() is predictable (V8's PRNG state can be reconstructed from
  // observed output), so use crypto for OTP and reset codes.
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += randomInt(0, 10).toString();
  }
  return otp;
}

export function storeOTP(
  email: string,
  otp: string,
  expiryMinutes: number = 10
): { success: boolean; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
  console.log(
    `[LibraSaaS] OTP stored for ${email}, expires at ${expiresAt.toISOString()}`
  );
  // TODO: actually persist this in MongoDB
  return { success: true, expiresAt };
}

export async function verifyOTP(
  email: string,
  otp: string
): Promise<boolean> {
  console.log(`[LibraSaaS] Verifying OTP for ${email}: ${otp}`);
  // TODO: verify against MongoDB
  return otp.length >= 4 && /^\d+$/.test(otp);
}