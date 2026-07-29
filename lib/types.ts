// User & Auth Types
export type UserRole = 'superadmin' | 'libraryAdmin' | 'member';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  libraryId?: string;
  avatar?: string;
  phone?: string;
  address?: string;
  membershipDate?: string;
}

export interface Session {
  user: User | null;
}

// Library Types
export interface Library {
  id: string;
  name: string;
  ownerEmail: string;
  membersCount: number;
  booksCount: number;
  status: 'trial' | 'active' | 'expired';
  revenue?: number;
  createdAt: string;
}

export interface LibraryStats {
  totalBooks: number;
  totalMembers: number;
  overdueBooks: number;
  totalFines: number;
}

// Book Types
export interface Book {
  id: string;
  libraryId: string;
  title: string;
  author: string;
  isbn: string;
  description?: string;
  category: string;
  publisher?: string;
  year?: number;
  available: number;
  total: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateBookInput {
  title: string;
  author: string;
  isbn: string;
  description?: string;
  category: string;
  publisher?: string;
  year?: number;
  total: number;
}

// Transaction Types
export type TransactionStatus = 'issued' | 'overdue' | 'returned';

export interface Transaction {
  id: string;
  libraryId: string;
  userId: string;
  bookId: string;
  memberName: string;
  bookTitle: string;
  issueDate: string;
  dueDate: string;
  returnDate?: string;
  status: TransactionStatus;
  fineAmount?: number;
  renewalCount?: number;
  lastRenewalDate?: string;
}

export interface UserTransaction extends Transaction {
  author: string;
  daysLeft?: number;
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// Form Input Types
export interface LoginInput {
  email: string;
  password: string;
}

export interface SignupInput {
  email: string;
  password: string;
  name?: string;
}

export interface BookSearchParams {
  search?: string;
  category?: string;
  available?: boolean;
  limit?: number;
}
