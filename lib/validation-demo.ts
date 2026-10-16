// lib/validation-demo.ts — shared by the manual "Add Demo Student" form and
// the QR demo form, so both give the same R15 messages.
import { ApiError } from '@/lib/api-response';
import { normalizePhone } from '@/lib/phone';

const MAX_UPLOAD = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PROOF_TYPES = [...PHOTO_TYPES, 'application/pdf'];

const text = (fd: FormData, key: string, max: number) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
};

export function readFile(fd: FormData, key: string): File | null {
  const v = fd.get(key);
  return v && typeof v !== 'string' && v.size > 0 ? (v as File) : null;
}

export function checkPhoto(file: File | null) {
  if (file && (!PHOTO_TYPES.includes(file.type) || file.size > MAX_UPLOAD)) {
    throw new ApiError(400, 'Photo must be a JPG, PNG or WebP under 5 MB.', 'BAD_PHOTO');
  }
}

export function checkIdProof(file: File | null) {
  if (file && (!PROOF_TYPES.includes(file.type) || file.size > MAX_UPLOAD)) {
    throw new ApiError(400, 'ID proof must be a JPG, PNG, WebP or PDF under 5 MB.', 'BAD_ID_PROOF');
  }
}

export interface DemoFormFields {
  name: string;
  phoneRaw: string;
  phoneE164: string;
  email?: string;
  shiftId: string;
  seatNumber: number | null;
  address?: string;
  examTarget?: string;
  collegeName?: string;
  parentContact?: string;
  notes?: string;
}

/** Common fields; `requireSeat` is true for the manual form. */
export function parseDemoForm(fd: FormData, { requireSeat }: { requireSeat: boolean }): DemoFormFields {
  const name = text(fd, 'name', 80);
  if (name.length < 2) throw new ApiError(400, 'Full name is required.', 'FIELD_name');

  const phoneRaw = text(fd, 'phone', 30);
  if (!phoneRaw) throw new ApiError(400, 'Mobile number is required.', 'FIELD_phone');
  const phoneE164 = normalizePhone(phoneRaw);
  if (!phoneE164) throw new ApiError(400, 'Enter a valid 10-digit mobile number.', 'FIELD_phone');

  const email = text(fd, 'email', 120).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, 'Enter a valid email address.', 'FIELD_email');
  }

  const shiftId = text(fd, 'shiftId', 30);
  if (!/^[a-f\d]{24}$/i.test(shiftId)) throw new ApiError(400, 'Choose a shift.', 'FIELD_shiftId');

  const seatRaw = text(fd, 'seatNumber', 6);
  const seatNumber = seatRaw ? Number(seatRaw) : null;
  if (seatNumber !== null && (!Number.isInteger(seatNumber) || seatNumber < 1)) {
    throw new ApiError(400, 'Choose a seat.', 'FIELD_seatNumber');
  }
  if (requireSeat && seatNumber === null) throw new ApiError(400, 'Choose a seat.', 'FIELD_seatNumber');

  const parentRaw = text(fd, 'parentContact', 30);
  let parentContact: string | undefined;
  if (parentRaw) {
    const p = normalizePhone(parentRaw);
    if (!p) throw new ApiError(400, 'Enter a valid 10-digit parent contact number.', 'FIELD_parentContact');
    parentContact = p;
  }

  return {
    name,
    phoneRaw,
    phoneE164,
    email: email || undefined,
    shiftId,
    seatNumber,
    address: text(fd, 'address', 300) || undefined,
    examTarget: text(fd, 'examTarget', 80) || undefined,
    collegeName: text(fd, 'collegeName', 120) || undefined,
    parentContact,
    notes: text(fd, 'notes', 500) || undefined,
  };
}
