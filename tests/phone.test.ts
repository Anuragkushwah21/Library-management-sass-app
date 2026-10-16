import { describe, expect, it } from 'vitest';
import { normalizePhone } from '@/lib/phone';

describe('normalizePhone', () => {
  it('treats the formats in the live DB as the same number', () => {
    expect(normalizePhone('9876543210')).toBe('+919876543210');
    expect(normalizePhone('+919876543210')).toBe('+919876543210');
    expect(normalizePhone('+91 98765-43210')).toBe('+919876543210');
    expect(normalizePhone('09876543210')).toBe('+919876543210');
    expect(normalizePhone('919876543210')).toBe('+919876543210');
    expect(normalizePhone('0091 98765 43210')).toBe('+919876543210');
  });
  it('keeps foreign numbers with a +', () => {
    expect(normalizePhone('+1 415 555 0100')).toBe('+14155550100');
  });
  it('rejects junk', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

import { withScheme } from '@/lib/services/library';
describe('withScheme (QR base URL)', () => {
  it('adds http for LAN/localhost and https for domains', () => {
    expect(withScheme('192.168.31.205:3000')).toBe('http://192.168.31.205:3000');
    expect(withScheme('localhost:3000/')).toBe('http://localhost:3000');
    expect(withScheme('library.example.com')).toBe('https://library.example.com');
    expect(withScheme('https://x.vercel.app/')).toBe('https://x.vercel.app');
  });
});
