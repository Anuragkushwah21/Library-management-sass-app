// app/api/messages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { notifyAdmins } from '@/lib/services/notify';
import { Message } from '@/lib/models/Message';
import { requireAdmin } from '@/lib/middleware/auth';
import { handleRouteError } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const CreateMessageSchema = z.object({
  name: z.string().min(2, 'Name is too short').max(100),
  email: z.string().email('Invalid email address'),
  subject: z.string().max(200).optional(),
  message: z
    .string()
    .min(10, 'Message must be at least 10 characters')
    .max(5000),
  // optional: client se aaya librarianId, sirf valid ObjectId hi accept karo
  librarianId: z.string().optional(),
});

// Public contact form — auth nahi, isliye rate limit zaroori hai
export async function POST(req: NextRequest) {
  try {
    const limited = enforceRateLimit(req, 'messages:create', {
      limit: 5,
      windowMs: 10 * 60 * 1000, // 5 messages / 10 min per IP
    });
    if (limited) return limited;

    await connectDB();

    const body = await req.json().catch(() => ({}));

    const parsed = CreateMessageSchema.parse({
      name: body.name?.trim(),
      email: body.email?.trim(),
      subject: body.subject?.trim(),
      message: body.message?.trim(),
      librarianId: body.librarianId,
    });

    // Garbage ObjectId se Mongoose cast error na aaye
    const librarianId =
      parsed.librarianId && mongoose.Types.ObjectId.isValid(parsed.librarianId)
        ? parsed.librarianId
        : null;

    const newMessage = await Message.create({
      librarianId,
      name: parsed.name,
      email: parsed.email,
      subject: parsed.subject,
      message: parsed.message,
    });

    await notifyAdmins({
      section: 'messages',
      type: 'contact.message',
      title: `New message from ${newMessage.name}`,
      body: newMessage.subject || String(newMessage.message || '').slice(0, 120),
      link: '/admin/messages',
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Your message has been sent to the admin.',
        data: { id: newMessage._id },
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid form data.',
          issues: error.issues,
        },
        { status: 400 }
      );
    }

    return handleRouteError(error, 'Failed to send message.', 'Messages POST');
  }
}

// Admin-only: saare messages list karo
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    await requireAdmin(req);

    const messages = await Message.find()
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return NextResponse.json(
      {
        success: true,
        data: messages,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(error, 'Failed to fetch messages.', 'Messages GET');
  }
}
