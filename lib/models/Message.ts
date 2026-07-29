// lib/models/Message.ts
import mongoose, { Schema, Document, models, model } from 'mongoose';

export interface IMessage extends Document {
  librarianId?: mongoose.Types.ObjectId | null;
  name: string;
  email: string;
  subject?: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved';
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    librarianId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    subject: {
      type: String,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved'],
      default: 'open',
    },
  },
  { timestamps: true }
);

export const Message =
  models.Message || model<IMessage>('Message', MessageSchema);