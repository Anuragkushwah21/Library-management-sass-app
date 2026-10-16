// lib/dashboard-data.ts
import { connectDB } from '@/lib/db';
import { Student } from '@/lib/models/Students';
import Seat from '@/lib/models/Seat';
import Book from '@/lib/models/Book';
import {Transaction} from '@/lib/models/Transaction'; // 👈 make sure this path is correct

export interface DashboardStats {
  totalStudents: number;
  paidMembers: number;
  seatsAvailable: number;
  booksIssued: number;
}

export interface StudentChartPoint {
  label: string; // e.g. 'Jan 25'
  value: number; // count of students
}

export interface PaymentStatusPoint {
  label: 'Paid' | 'Unpaid' | 'Part paid';
  value: number;
}

export interface ActivityItem {
  id: string;
  type: 'student' | 'book';
  description: string;
  createdAt: string; // ISO string
}

// ---------- Top stats (per librarian) ----------
export async function fetchDashboardStats(
  librarianId: string
): Promise<DashboardStats> {
  await connectDB();

  if (!librarianId) {
    throw new Error('librarianId is required for fetchDashboardStats');
  }

  const [totalStudents, paidMembers, seatsAvailable, booksIssued] =
    await Promise.all([
      Student.countDocuments({ librarianId }),
      Student.countDocuments({ librarianId, status: 'ACTIVE_MEMBER', archivedAt: null, paymentStatus: 'paid' }),
      Seat.countDocuments({ librarianId, status: 'available' }),

      // ✅ FIX: issued books from Transaction model
      // Update this query according to your Transaction schema
      Transaction.countDocuments({
        librarianId,
        status: 'issued', // or 'ISSUED' / use correct enum from your model
        // if you use flags instead:
        // isReturned: false,
        // or returnedAt: { $exists: false },
      }),
    ]);

  return {
    totalStudents,
    paidMembers,
    seatsAvailable,
    booksIssued,
  };
}

// ---------- Student chart – last 6 months new students (per librarian) ----------
export async function fetchStudentChartData(
  librarianId: string
): Promise<StudentChartPoint[]> {
  await connectDB();

  if (!librarianId) {
    throw new Error('librarianId is required for fetchStudentChartData');
  }

  const now = new Date();
  const months: StudentChartPoint[] = [];

  // last 6 months including current
  for (let i = 5; i >= 0; i--) {
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

    const count = await Student.countDocuments({
      librarianId,
      createdAt: { $gte: from, $lt: to },
    });

    const label = from.toLocaleDateString('en-IN', {
      month: 'short',
      year: '2-digit',
    });

    months.push({ label, value: count });
  }

  return months;
}

// ---------- Payment status chart (per librarian) ----------
export async function fetchPaymentStatusData(
  librarianId: string
): Promise<PaymentStatusPoint[]> {
  await connectDB();

  if (!librarianId) {
    throw new Error('librarianId is required for fetchPaymentStatusData');
  }

  // Members only — demo students haven't been asked to pay yet
  const members = { librarianId, status: { $in: ['ACTIVE_MEMBER', 'EXPIRED'] }, archivedAt: null };
  const [paid, unpaid, pending] = await Promise.all([
    Student.countDocuments({ ...members, paymentStatus: 'paid' }),
    Student.countDocuments({ ...members, paymentStatus: 'unpaid' }),
    Student.countDocuments({ ...members, paymentStatus: 'pending' }),
  ]);

  return [
    { label: 'Paid', value: paid },
    { label: 'Unpaid', value: unpaid },
    { label: 'Part paid', value: pending },
  ];
}

/** Records without a createdAt (old imports) fall back to the ObjectId's time instead of crashing. */
function isoOrIdTime(doc: any): string {
  const d = doc.createdAt ? new Date(doc.createdAt) : null;
  if (d && !Number.isNaN(d.getTime())) return d.toISOString();
  return typeof doc._id?.getTimestamp === 'function' ? doc._id.getTimestamp().toISOString() : new Date(0).toISOString();
}

// ---------- Recent activity (per librarian) ----------
export async function fetchRecentActivity(
  librarianId: string
): Promise<ActivityItem[]> {
  await connectDB();

  if (!librarianId) {
    throw new Error('librarianId is required for fetchRecentActivity');
  }

  const [students, books] = await Promise.all([
    Student.find({ librarianId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Book.find({ librarianId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
  ]);

  const activities: ActivityItem[] = [
    ...students.map((s: any) => ({
      id: `student-${s._id.toString()}`,
      type: 'student' as const,
      description: `New student added: ${s.name}`,
      createdAt: isoOrIdTime(s),
    })),
    ...books.map((b: any) => ({
      id: `book-${b._id.toString()}`,
      type: 'book' as const,
      description: `Book "${b.title}" added/updated`,
      createdAt: isoOrIdTime(b),
    })),
  ];

  activities.sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
  );

  return activities.slice(0, 10);
}