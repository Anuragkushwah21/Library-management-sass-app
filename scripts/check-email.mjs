/**
 * Email config check — asli email bheje bina credentials verify karta hai,
 * aur `--send <email>` do to ek test mail bhi bhej deta hai.
 *
 *   node --env-file=.env scripts/check-email.mjs
 *   node --env-file=.env scripts/check-email.mjs --send you@example.com
 */
import nodemailer from 'nodemailer';

const provider =
  process.env.EMAIL_PROVIDER?.trim().toLowerCase() ||
  (process.env.SMTP_HOST ? 'smtp' : 'resend');

const from = (() => {
  const addr =
    process.env.EMAIL_FROM ||
    process.env.SMTP_FROM_EMAIL ||
    process.env.SMTP_USER ||
    'onboarding@resend.dev';
  const name = process.env.NEXT_PUBLIC_APP_NAME || 'LibraSaaS';
  return addr.includes('<') ? addr : `${name} <${addr}>`;
})();

const sendIndex = process.argv.indexOf('--send');
const sendTo = sendIndex > -1 ? process.argv[sendIndex + 1] : null;

console.log(`provider : ${provider}`);
console.log(`from     : ${from}`);

if (provider === 'smtp') {
  const port = Number(process.env.SMTP_PORT || 587);
  console.log(`host     : ${process.env.SMTP_HOST}:${port}`);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === 'true'
      : port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });

  try {
    await transporter.verify();
    console.log('\n✓ SMTP credentials valid');
  } catch (err) {
    console.log('\n✗ SMTP failed');
    console.log(`  code: ${err.code} / ${err.responseCode}`);
    console.log(`  ${err.message}`);
    process.exit(1);
  }

  if (sendTo) {
    const info = await transporter.sendMail({
      from,
      to: sendTo,
      subject: 'LibraSaaS - email config test',
      html: '<p>Yeh mil gayi to email setup kaam kar raha hai. ✅</p>',
      text: 'Yeh mil gayi to email setup kaam kar raha hai.',
    });
    console.log(`✓ Sent to ${sendTo} — ${info.messageId}`);
  }
} else {
  if (!process.env.RESEND_API_KEY) {
    console.log('\n✗ RESEND_API_KEY set nahi hai');
    process.exit(1);
  }
  console.log('\n✓ RESEND_API_KEY present');

  if (sendTo) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: sendTo,
        subject: 'LibraSaaS - email config test',
        html: '<p>Yeh mil gayi to email setup kaam kar raha hai. ✅</p>',
      }),
    });
    const body = await res.json();
    if (res.ok) {
      console.log(`✓ Sent to ${sendTo} — ${body.id}`);
    } else {
      console.log(`✗ Send failed (${res.status}): ${body.message}`);
      process.exit(1);
    }
  }
}
