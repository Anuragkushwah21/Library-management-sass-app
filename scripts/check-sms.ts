/**
 * SMS (student OTP) config check — like check-email.mjs.
 *
 *   npx tsx --env-file=.env scripts/check-sms.ts                     # config only, sends nothing
 *   npx tsx --env-file=.env scripts/check-sms.ts --send 9876543210   # one real test SMS
 */
import { getOtpChannel, otpMessage } from '@/lib/otp/channels';
import { normalizePhone } from '@/lib/phone';

async function main() {
  const channel = getOtpChannel(); // throws with the missing keys if .env is incomplete
  console.log(`provider : ${channel.name}${process.env.OTP_CHANNEL ? '' : '  (auto-detected — set OTP_CHANNEL to be explicit)'}`);
  if (channel.name === 'console') {
    console.log('\nNo SMS provider configured: codes are printed in the server terminal (dev only).');
    console.log('Set OTP_CHANNEL and that provider’s keys in .env — see .env.example.');
    return;
  }
  console.log('config   : OK');
  if (['twilio', 'webhook'].includes(channel.name)) {
    console.log(`message  : "${otpMessage('123456', 'Your Library')}"`);
  }

  const i = process.argv.indexOf('--send');
  if (i === -1) {
    console.log('\nAdd --send <mobile> to send a real test SMS.');
    return;
  }
  const phone = normalizePhone(process.argv[i + 1]);
  if (!phone) throw new Error('Give a valid mobile number after --send');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  console.log(`\nsending test code ${code} to ${phone}…`);
  await channel.send(phone, code, process.env.NEXT_PUBLIC_APP_NAME || 'LibraryMS');
  console.log('✓ accepted by the provider — check the phone.');
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
