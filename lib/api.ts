// lib/api.ts

interface FetchOptions extends RequestInit {
  headers?: Record<string, string>;
}

/**
 * Auth token deliberately localStorage me store nahi hota.
 * Login route `authToken` ko httpOnly cookie me set karta hai — usko JS padh
 * nahi sakta, isliye XSS se churaya nahi ja sakta. Same-origin requests par
 * browser cookie apne aap bhejta hai.
 */

// Make sure we always use absolute URL on server
function getApiUrl(endpoint: string): string {
  // Already absolute
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }

  if (typeof window !== 'undefined') {
    return endpoint; // browser can use relative
  }

  // On server: use NEXT_PUBLIC_API_BASE_URL or fallback
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
  return `${baseUrl}${endpoint}`;
}

// Core fetch with auth + JSON error handling
async function apiFetch(endpoint: string, options: FetchOptions = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(getApiUrl(endpoint), {
    ...options,
    headers,
    credentials: 'same-origin', // authToken cookie bhejo
  });

  // Try to parse body once
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      (body && (body.error || body.message)) ||
      `API error: ${response.status}`;
    throw new Error(message);
  }

  // Some APIs wrap data, some return direct
  return body;
}

export const api = {
  // ========== AUTH ==========
  register: async (payload: {
    name: string;
    firstName?: string;
    lastName?: string;
    email: string;
    password: string;
    phone?: string;
  }) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      const error =
        data?.error || data?.message || 'Registration failed';
      throw new Error(error);
    }
    return data;
  },

  // Resend OTP
  resendOTP: async (payload: { email: string }) => {
    const res = await fetch('/api/auth/resend-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      const error =
        data?.error || data?.message || 'Failed to resend OTP';
      throw new Error(error);
    }
    return data;
  },

  // Verify OTP
  verifyOTP: async (payload: { email: string; otp: string }) => {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      const error =
        data?.error || data?.message || 'Failed to verify OTP';
      throw new Error(error);
    }
    return data;
  },

  login: (data: { email: string; password: string }) =>
    apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getCurrentUser: () => apiFetch('/api/auth/me'),

  logout: () => {
    clearAuthData();
  },

  forgotPassword: (data: { email: string }) =>
    apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  resetPassword: (data: {
    email: string;
    code: string;
    newPassword: string;
  }) =>
    apiFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  changePassword: (payload: {
    currentPassword: string;
    newPassword: string;
  }) =>
    apiFetch('/api/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  getLibrarianNotificationSettings: () =>
    apiFetch('/api/notifications', {
      method: 'GET',
    }),

  updateLibrarianNotificationSettings: (payload: {
    emailNotifications: boolean;
    overdueReminders: boolean;
    newMemberAlerts: boolean;
    systemUpdates: boolean;
  }) =>
    apiFetch('/api/notifications', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  // ========== CONTACT / MESSAGES ==========
  // Librarian sends a message / query to admin
  createMessage: (data: {
    name: string;
    email: string;
    subject?: string;
    message: string;
    librarianId?: string;
  }) =>
    apiFetch('/api/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Admin: get all messages from librarians
  getMessages: (params?: Record<string, any>) => {
    const query = params ? new URLSearchParams(params).toString() : '';
    return apiFetch(`/api/messages${query ? `?${query}` : ''}`);
  },

  // Admin: update message status (open / in_progress / resolved)
  updateMessageStatus: (
    messageId: string,
    status: 'open' | 'in_progress' | 'resolved'
  ) =>
    apiFetch(`/api/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // ========== ADMIN (manage librarians, stats) ==========
  getPendingLibrarians: () => apiFetch('/api/admin/librarians/pending'),

  getAllLibrarians: (params?: Record<string, any>) => {
    const query = params ? new URLSearchParams(params).toString() : '';
    return apiFetch(`/api/admin/librarians${query ? `?${query}` : ''}`);
  },

  approveLibrarian: (librarianId: string) =>
    apiFetch(`/api/admin/librarians/${librarianId}/approve`, {
      method: 'POST',
    }),

  rejectLibrarian: (librarianId: string, reason: string) =>
    apiFetch(`/api/admin/librarians/${librarianId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  getLibrarian: (librarianId: string) =>
    apiFetch(`/api/admin/librarians/${librarianId}`),

  updateLibrarian: (librarianId: string, data: any) =>
    apiFetch(`/api/admin/librarians/${librarianId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteLibrarian: (librarianId: string) =>
    apiFetch(`/api/admin/librarians/${librarianId}`, {
      method: 'DELETE',
    }),

  getAdminStats: () => apiFetch('/api/admin/stats'),
  updateAdminProfile: (data: { name: string; email: string; phone?: string }) =>
    apiFetch('/api/admin/settings/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updateAdminPassword: (data: {
    currentPassword: string;
    newPassword: string;
  }) =>
    apiFetch('/api/admin/settings/password', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updateAdminNotifications: (data: {
    emailNotifications: boolean;
    newRegistrations: boolean;
    systemUpdates: boolean;
    weeklyReports: boolean;
  }) =>
    apiFetch('/api/admin/settings/notifications', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updateSystemSettings: (data: {
    siteName: string;
    supportEmail: string;
    autoApproveLibrarians: boolean;
    maintenanceMode: boolean;
  }) =>
    apiFetch('/api/admin/settings/system', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // ========== LIBRARIAN DASHBOARD ==========
  getDashboardStats: () => apiFetch('/api/dashboard'),
  getLibrarianDashboard: () => apiFetch('/api/librarian/dashboard'),

  // Profile (librarian's own profile)
  getMyProfile: () => apiFetch('/api/profile'),

  updateMyProfile: (data: any) =>
    apiFetch('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // ========== BOOKS ==========
  getBooks: (params?: Record<string, any>) => {
    const query = params ? new URLSearchParams(params).toString() : '';
    return apiFetch(`/api/books${query ? `?${query}` : ''}`);
  },

  getBook: (bookId: string) => apiFetch(`/api/books/${bookId}`),

  createBook: (data: {
    title: string;
    author: string;
    isbn?: string;
    totalCopies?: number;
  }) =>
    apiFetch('/api/books', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateBook: (
    bookId: string,
    data: {
      title?: string;
      author?: string;
      isbn?: string;
      totalCopies?: number;
      reverseIssue?: boolean;
      status?: string;
    }
  ) =>
    apiFetch(`/api/books/${bookId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteBook: (bookId: string) =>
    apiFetch(`/api/books/${bookId}`, {
      method: 'DELETE',
    }),

  // ========== MEMBERSHIPS ==========
  getMemberships: () => apiFetch('/api/memberships'),

  sendMembershipReminders: () =>
    apiFetch('/api/send-reminder', {
      method: 'POST',
    }),

  // ========== SEATS ==========
  getSeats: (params?: Record<string, any>) => {
    const query = params ? new URLSearchParams(params).toString() : '';
    return apiFetch(`/api/seats${query ? `?${query}` : ''}`);
  },

  getSeat: (seatId: string) => apiFetch(`/api/seats/${seatId}`),

  createSeat: (data: {
    seatNumber: number;
    status?: string;
    notes?: string;
  }) =>
    apiFetch('/api/seats', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSeat: (
    seatId: string,
    data: {
      status?: string;
      studentId?: string;
      reservedUntil?: string;
      notes?: string;
    }
  ) =>
    apiFetch(`/api/seats/${seatId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteSeat: (seatId: string) =>
    apiFetch(`/api/seats/${seatId}`, {
      method: 'DELETE',
    }),

  // ========== STUDENTS (library members) ==========
  getStudents: (params?: Record<string, any>) => {
    const query = params ? new URLSearchParams(params).toString() : '';
    return apiFetch(`/api/students${query ? `?${query}` : ''}`);
  },

  getStudent: (id: string) => apiFetch(`/api/students/${id}`),

  createStudent: (data: any) =>
    apiFetch('/api/students', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateStudent: (id: string, data: any) =>
    apiFetch(`/api/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteStudent: (id: string) =>
    apiFetch(`/api/students/${id}`, {
      method: 'DELETE',
    }),

  // ========== TRANSACTIONS (issue/return/renew) ==========
  getTransactions: (params?: Record<string, any>) => {
    const query = params ? new URLSearchParams(params).toString() : '';
    return apiFetch(`/api/transactions${query ? `?${query}` : ''}`);
  },

  issueBook: (data: { bookId: string; memberId: string; dueDate?: string }) =>
    apiFetch('/api/transactions/issue', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  returnBook: (transactionId: string, notes?: string) =>
    apiFetch(`/api/transactions/${transactionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'return', notes }),
    }),

  renewBook: (transactionId: string, days?: number) =>
    apiFetch(`/api/transactions/${transactionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'renew', days }),
    }),
};

// ===== Auth helpers / role utils =====

export type ApiError = Error;

/**
 * Sirf UI hint hai (kya logged-in chrome dikhana hai). Asli gate proxy.ts aur
 * API routes ka `authenticateRequest` hai — ise bypass karke kuch milta nahi.
 */
export function isAuthenticated(): boolean {
  return !!getStoredUser();
}

export function getStoredUser() {
  if (typeof window === 'undefined') return null;
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;

  try {
    return JSON.parse(userStr);
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

// Sirf display data (name/email/role). Token httpOnly cookie me rehta hai.
export function storeAuthData(user: any) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('user', JSON.stringify(user));
}

export async function clearAuthData() {
  if (typeof window === 'undefined') return;

  localStorage.removeItem('user');
  // Purane builds ka leftover token bhi saaf kar do
  localStorage.removeItem('token');

  // Cookie httpOnly hai, isliye server hi use clear kar sakta hai
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch {
    // Network fail ho to bhi local state clear ho chuka hai
  }
}

export function getUserRole(): 'admin' | 'librarian' | null {
  const user = getStoredUser();
  return user?.role || null;
}

export function isAdmin(): boolean {
  return getUserRole() === 'admin';
}

export function isLibrarian(): boolean {
  return getUserRole() === 'librarian';
}