// lib/phone.ts — normalize phone numbers to E.164 so "98765 43210" and
// "+91 9876543210" are the same student. Pure, unit-tested.

const DEFAULT_COUNTRY_CODE = '91';

/**
 * Returns E.164 (e.g. "+919876543210") or null when the input can't be a
 * phone number. Bare 10-digit numbers are taken as Indian.
 */
export function normalizePhone(raw: unknown, countryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const str = String(raw).trim();
  if (!str) return null;

  const hasPlus = str.startsWith('+');
  let digits = str.replace(/\D/g, '');
  if (!digits) return null;

  if (hasPlus) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+${countryCode}${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+${countryCode}${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith(countryCode)) return `+${digits}`;
  return null;
}

/** "+919876543210" → "+91 ••••• •3210" for screens that shouldn't show it in full. */
export function maskPhone(e164: string): string {
  const last = e164.slice(-4);
  return `${e164.slice(0, 3)} ••••• •${last}`;
}
