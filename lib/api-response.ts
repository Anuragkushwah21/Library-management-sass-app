import { NextResponse } from 'next/server';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
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

export function errorResponse(error: string, statusCode = 400): ApiResponse {
  return {
    success: false,
    error,
    statusCode,
  };
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handleApiError(error: any) {
  if (error instanceof ApiError) {
    return errorResponse(error.message, error.statusCode);
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
      { success: false, error: error.message },
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
