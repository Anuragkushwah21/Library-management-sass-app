// lib/models/User.ts

import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: 'admin' | 'librarian';
  profileImage?: string;

  // Approval fields
  isApproved: boolean;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;

  // OTP fields
  otp?: string;
  otpExpiry?: Date;
  isVerified: boolean;

  // Forgot password fields
  resetPasswordCode?: string;
  resetPasswordCodeExpires?: Date;

  // Account status
  status?: 'active' | 'inactive';

  // Notification settings
  notificationSettings?: {
    emailNotifications: boolean;
    overdueReminders: boolean;
    newMemberAlerts: boolean;
    systemUpdates: boolean;
  };

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateOTP(): string;
  verifyOTP(otp: string): boolean;
  clearOTP(): void;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,   // yahi index + unique ke liye kaafi hai
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    firstName: {
      type: String,
      trim: true,
    },

    lastName: {
      type: String,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    role: {
      type: String,
      enum: ['admin', 'librarian'],
      default: 'librarian',
    },

    profileImage: {
      type: String,
    },

    // Approval fields
    isApproved: {
      type: Boolean,
      default: false,
    },

    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },

    approvedAt: {
      type: Date,
    },

    rejectedAt: {
      type: Date,
    },

    rejectionReason: {
      type: String,
    },

    // OTP
    otp: {
      type: String,
    },

    otpExpiry: {
      type: Date,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    // Forgot password
    resetPasswordCode: {
      type: String,
    },

    resetPasswordCodeExpires: {
      type: Date,
    },

    // Account status
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },

    // Notification settings
    notificationSettings: {
      emailNotifications: {
        type: Boolean,
        default: true,
      },
      overdueReminders: {
        type: Boolean,
        default: true,
      },
      newMemberAlerts: {
        type: Boolean,
        default: false,
      },
      systemUpdates: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate OTP
UserSchema.methods.generateOTP = function (): string {
  // crypto, kyunki Math.random() predictable hai
  const otp = randomInt(100000, 1000000).toString();
  this.otp = otp;
  this.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  return otp;
};

// Verify OTP
UserSchema.methods.verifyOTP = function (otp: string): boolean {
  if (!this.otp || !this.otpExpiry) return false;
  if (this.otpExpiry < new Date()) return false;
  return this.otp === otp;
};

// Clear OTP
UserSchema.methods.clearOTP = function (): void {
  this.otp = undefined;
  this.otpExpiry = undefined;
};

// Indexes
// email ke liye field-level unique hi enough hai, isliye yahan index nahi bana rahe

// compound index useful hai (role + isApproved)
UserSchema.index({ role: 1, isApproved: 1 });

export const User =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);