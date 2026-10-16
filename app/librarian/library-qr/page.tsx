import { redirect } from 'next/navigation';

/** Renamed to QR Attendance (PLAN §12.4). */
export default function LibraryQrRedirect() {
  redirect('/librarian/qr-attendance');
}
