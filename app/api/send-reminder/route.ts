// app/api/send-reminders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleRouteError } from '@/lib/api-response';
import { Student } from '@/lib/models/Students';
import { sendMembershipReminderEmail } from '@/lib/email-service';
import { authenticateRequest } from '@/lib/middleware/auth';

export const runtime = 'nodejs';

// POST /api/send-reminders
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const today = new Date();
    const thresholdDays = 7; // expire in <= 7 days

    // Tenant‑scoped query: sirf current librarian ke students
    const upcoming = await Student.find({
      librarianId: userId,
      paymentStatus: 'paid',
      membershipEndDate: { $ne: null },
    }).lean();

    let sentCount = 0;

    for (const s of upcoming) {
      if (!s.email || !s.membershipEndDate) continue;

      const end = new Date(s.membershipEndDate);
      if (Number.isNaN(end.getTime())) continue;

      const diffMs = end.getTime() - today.getTime();
      const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (daysLeft > 0 && daysLeft <= thresholdDays) {
        // Library name env se, ya per-tenant naam ho to wahan se
        const libraryName =
          process.env.NEXT_PUBLIC_LIBRARY_NAME || 'Your Library';

        const result = await sendMembershipReminderEmail({
          recipientEmail: s.email,
          recipientName: (s as any).name || 'Member',
          libraryName,
          daysLeft,
        });

        if (result.success) {
          sentCount++;
        } else {
          console.error(
            `[Reminder] Failed to send email to ${s.email}:`,
            result.error
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Reminders processed',
      details: { sentCount },
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to send reminders', 'API');
  }
}