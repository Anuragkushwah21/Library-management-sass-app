import { NextResponse } from 'next/server';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
  statusCode: number;
}

export function successResponse<T>(data: T, message = 'Success', statusCode = 200): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
    statusCode,
  };
}

export function errorResponse(
  error: string,
  statusCode = 400,
  code?: string
): ApiResponse {
  return {
    success: false,
    error,
    statusCode,
    ...(code ? { code } : {}),
  };
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    /** Machine-readable reason the client can branch on, e.g. ACCESS_LOCKED */
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handleApiError(error: any) {
  if (error instanceof ApiError) {
    return errorResponse(error.message, error.statusCode, error.code);
  }

  if (error instanceof Error) {
    return errorResponse(error.message, 500);
  }

  return errorResponse('Internal server error', 500);
}

/**
 * Route handlers ke liye single error mapper.
 * ApiError (aur uske subclasses: AuthError, TransactionError) apna status code
 * carry karte hain; baaki sab internal error hai, isliye message leak nahi karte.
 */
export function handleRouteError(
  error: any,
  fallbackMessage = 'Internal server error',
  logPrefix?: string
): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
      },
      { status: error.statusCode }
    );
  }

  // JWT ke apne error types
  if (
    error?.name === 'JsonWebTokenError' ||
    error?.name === 'TokenExpiredError' ||
    error?.name === 'NotBeforeError'
  ) {
    return NextResponse.json(
      { success: false, error: 'Invalid or expired token.' },
      { status: 401 }
    );
  }

  if (error?.name === 'ZodError') {
    return NextResponse.json(
      { success: false, error: 'Validation failed', issues: error.issues },
      { status: 400 }
    );
  }

  console.error(`[${logPrefix || 'Route'}] Error:`, error);

  return NextResponse.json(
    { success: false, error: fallbackMessage },
    { status: 500 }
  );
}
