// app/api/students/broadcast/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Student } from '@/lib/models/Students';
import { User } from '@/lib/models/User';
import { authenticateRequest } from '@/lib/middleware/auth';
import { handleRouteError, successResponse } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { sendOfferEmail } from '@/lib/email-service';

export const runtime = 'nodejs';
// Sequential sending takes a while with many students
export const maxDuration = 60;

const BroadcastSchema = z.object({
  headline: z.string().trim().min(3).max(80),
  subject: z.string().trim().min(3).max(150),
  message: z.string().trim().min(10).max(3000),
  badge: z.string().trim().max(24).optional(),
  validTill: z.string().trim().max(40).optional(),
  ctaLabel: z.string().trim().max(40).optional(),
  ctaUrl: z.string().trim().url().max(500).optional().or(z.literal('')),

  /** Empty/absent = all of this librarian's students */
  studentIds: z.array(z.string()).max(1000).optional(),
  /** Only send to students with this payment status */
  paymentStatus: z.enum(['paid', 'unpaid', 'pending']).optional(),
  /** true = send nothing, just report how many recipients there would be */
  dryRun: z.boolean().optional(),
});

/**
 * Both Gmail and Brevo throttle bursts, so emails go out in small batches.
 * One failed recipient does not stop the rest — each result is reported
 * separately.
 */
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: NextRequest) {
  try {
    const decoded = await authenticateRequest(request);

    await connectDB();

    const body = await request.json().catch(() => ({}));
    const input = BroadcastSchema.parse(body);

    // A dry run sends nothing, and the UI calls it on every audience change —
    // so don't count it against the strict send limit, or a librarian would be
    // blocked after five clicks.
    const limited = input.dryRun
      ? enforceRateLimit(request, 'students:broadcast:dry', {
          limit: 60,
          windowMs: 10 * 60 * 1000,
          identifier: decoded.userId,
        })
      : enforceRateLimit(request, 'students:broadcast', {
          limit: 5,
          windowMs: 60 * 60 * 1000,
          identifier: decoded.userId,
        });
    if (limited) return limited;

    // ---- Recipients (tenant-scoped) ----
    const query: Record<string, unknown> = {};

    // A librarian can only email their own students. Admins are unscoped, but
    // must pass explicit studentIds — otherwise a slip would mail every
    // library's students.
    if (decoded.role === 'librarian') {
      query.librarianId = decoded.userId;
    } else if (!input.studentIds?.length) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Admin must pass explicit studentIds — a library-wide broadcast is only available to that library’s librarian.',
        },
        { status: 400 }
      );
    }

    if (input.studentIds?.length) {
      const validIds = input.studentIds.filter((id) =>
        mongoose.Types.ObjectId.isValid(id)
      );
      if (validIds.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No valid student ids provided.' },
          { status: 400 }
        );
      }
      query._id = { $in: validIds };
    }

    if (input.paymentStatus) {
      query.paymentStatus = input.paymentStatus;
    }

    const students = await Student.find(query).select('name email').lean();

    // Skip anyone without an email, and de-duplicate
    const seen = new Set<string>();
    const recipients = students.filter((s: any) => {
      const email = String(s.email || '').trim().toLowerCase();
      if (!email || !email.includes('@') || seen.has(email)) return false;
      seen.add(email);
      return true;
    });

    if (recipients.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No students matched — nothing to send.' },
        { status: 400 }
      );
    }

    if (input.dryRun) {
      return NextResponse.json(
        successResponse(
          {
            dryRun: true,
            recipientCount: recipients.length,
            sample: recipients.slice(0, 5).map((r: any) => r.email),
          },
          'Dry run — no emails sent',
          200
        ),
        { status: 200 }
      );
    }

    // ---- Library name (shown in the banner + footer) ----
    const owner = await User.findById(
      decoded.role === 'librarian' ? decoded.userId : undefined
    )
      .select('name')
      .lean();

    const libraryName =
      (owner as any)?.name ||
      process.env.LIBRARY_NAME ||
      process.env.NEXT_PUBLIC_APP_NAME ||
      'Your Library';

    // ---- Send in batches ----
    const sent: string[] = [];
    const failed: Array<{ email: string; error: string }> = [];

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      const results = await Promise.all(
        batch.map(async (student: any) => {
          const result = await sendOfferEmail({
            recipientEmail: student.email,
            recipientName: student.name || 'Student',
            libraryName,
            subject: input.subject,
            headline: input.headline,
            badge: input.badge || undefined,
            message: input.message,
            validTill: input.validTill || undefined,
            ctaLabel: input.ctaLabel || undefined,
            ctaUrl: input.ctaUrl || undefined,
          });
          return { email: student.email, result };
        })
      );

      for (const { email, result } of results) {
        if (result.success) sent.push(email);
        else failed.push({ email, error: result.error || 'Unknown error' });
      }

      if (i + BATCH_SIZE < recipients.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    console.log(
      `[Broadcast] ${decoded.email}: ${sent.length} sent, ${failed.length} failed`
    );

    // Everything failed means a config problem — don't report success
    if (sent.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Could not send to any recipient.',
          data: { sentCount: 0, failedCount: failed.length, failed },
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      successResponse(
        {
          sentCount: sent.length,
          failedCount: failed.length,
          // No value in returning the full list, only the failures
          failed: failed.slice(0, 50),
        },
        failed.length
          ? `Sent to ${sent.length} students, ${failed.length} failed`
          : `Sent to ${sent.length} students`,
        200
      ),
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to send broadcast.', 'Broadcast');
  }
}
