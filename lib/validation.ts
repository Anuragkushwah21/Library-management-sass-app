// lib/validation.ts

import { z } from 'zod';

// ========== AUTH SCHEMAS ==========

export const RegisterSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: z.string().optional(),
  
  // ✅ Role-based fields
  role: z.enum(['super_admin', 'admin', 'member']).default('member'),
  
  // For admin registration
  libraryName: z.string().optional(),
  subdomain: z.string().optional(),
  
  // For member registration
  libraryId: z.string().optional(),
}).refine(
  (data) => {
    return (data.firstName && data.lastName) || data.name;
  },
  { message: 'Provide either name or firstName & lastName' }
);

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  libraryId: z.string().min(1, 'Library ID is required'), // ✅ Added for multi-tenancy
});

export const VerifyOTPSchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

export const SendOTPSchema = z.object({
  email: z.string().email('Invalid email address'),
  purpose: z.enum(['verification', 'login', 'reset']).optional().default('verification'),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
  libraryId: z.string().min(1, 'Library ID is required'),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const GoogleSignUpSchema = z.object({
  googleToken: z.string().min(1, 'Google token is required'),
  libraryId: z.string().min(1, 'Library ID is required'),
  role: z.enum(['admin', 'vendor', 'user']).optional().default('user'),
});

// ========== LIBRARY SCHEMAS ==========

export const CreateLibrarySchema = z.object({
  name: z.string().min(1, 'Library name is required'),
  subdomain: z.string().min(1, 'Subdomain is required').regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens allowed'),
  code: z.string().min(1, 'Library code is required').optional(),
  description: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  logo: z.string().optional(),
  adminEmail: z.string().email('Admin email is required'),
  adminName: z.string().min(1, 'Admin name is required'),
  adminPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const UpdateLibrarySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  logo: z.string().optional(),
  isActive: z.boolean().optional(),
});

// ========== BOOK SCHEMAS ==========

export const CreateBookSchema = z.object({
  libraryId: z.string().min(1, 'Library ID is required'),
  title: z.string().min(1, 'Book title is required'),
  author: z.string().min(1, 'Author name is required'),
  isbn: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  description: z.string().optional(),
  publishedYear: z.number().min(1000).max(new Date().getFullYear() + 1).optional(),
  publisher: z.string().optional(),
  pages: z.number().min(1).optional(),
  language: z.string().default('English'),
  totalCopies: z.number().min(1, 'Total copies must be at least 1'),
  availableCopies: z.number().optional(), // Auto-set to totalCopies if not provided
  coverImage: z.string().url().optional(),
  location: z.string().optional(), // Shelf location
  price: z.number().min(0).optional(),
});

export const UpdateBookSchema = z.object({
  title: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
  isbn: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  publishedYear: z.number().min(1000).max(new Date().getFullYear() + 1).optional(),
  publisher: z.string().optional(),
  pages: z.number().min(1).optional(),
  language: z.string().optional(),
  totalCopies: z.number().min(1).optional(),
  availableCopies: z.number().min(0).optional(),
  coverImage: z.string().url().optional(),
  location: z.string().optional(),
  price: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

// ========== TRANSACTION SCHEMAS ==========

export const IssueBookSchema = z.object({
  libraryId: z.string().min(1, 'Library ID is required'),
  memberId: z.string().min(1, 'Member ID is required'),
  bookId: z.string().min(1, 'Book ID is required'),
  dueDate: z.string().datetime().optional(), // ISO date string
  notes: z.string().optional(),
});

export const RenewBookSchema = z.object({
  transactionId: z.string().min(1, 'Transaction ID is required'),
  extensionDays: z.number().min(1).max(30).optional().default(7),
});

export const ReturnBookSchema = z.object({
  transactionId: z.string().min(1, 'Transaction ID is required'),
  condition: z.enum(['good', 'damaged', 'lost']).optional().default('good'),
  fine: z.number().min(0).optional(),
  notes: z.string().optional(),
});

// ========== USER SCHEMAS ==========

export const UpdateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  avatar: z.string().url().optional(),
  membershipId: z.string().optional(),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Confirm password is required'),
}).refine(
  (data) => data.newPassword === data.confirmPassword,
  {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }
);

// ========== SEARCH/FILTER SCHEMAS ==========

export const SearchBooksSchema = z.object({
  q: z.string().optional(), // Search query
  category: z.string().optional(),
  author: z.string().optional(),
  language: z.string().optional(),
  availableOnly: z.boolean().optional().default(false),
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(10),
  sortBy: z.enum(['title', 'author', 'publishedYear', 'createdAt']).optional().default('title'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

export const SearchTransactionsSchema = z.object({
  status: z.enum(['issued', 'returned', 'overdue', 'renewed']).optional(),
  memberId: z.string().optional(),
  bookId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(10),
});

// ========== TYPE EXPORTS ==========

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type VerifyOTPInput = z.infer<typeof VerifyOTPSchema>;
export type SendOTPInput = z.infer<typeof SendOTPSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type GoogleSignUpInput = z.infer<typeof GoogleSignUpSchema>;

export type CreateLibraryInput = z.infer<typeof CreateLibrarySchema>;
export type UpdateLibraryInput = z.infer<typeof UpdateLibrarySchema>;

export type CreateBookInput = z.infer<typeof CreateBookSchema>;
export type UpdateBookInput = z.infer<typeof UpdateBookSchema>;
export type SearchBooksInput = z.infer<typeof SearchBooksSchema>;

export type IssueBookInput = z.infer<typeof IssueBookSchema>;
export type RenewBookInput = z.infer<typeof RenewBookSchema>;
export type ReturnBookInput = z.infer<typeof ReturnBookSchema>;
export type SearchTransactionsInput = z.infer<typeof SearchTransactionsSchema>;

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;