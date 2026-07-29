// lib/rate-limit.ts
import { NextRequest, NextResponse } from 'next/server';

/**
 * Simple in-memory sliding-window rate limiter.
 *
 * NOTE: this uses per-instance memory. Fine for a single server or a
 * long-lived container, but on a multi-instance or serverless deploy each
 * instance keeps its own counter. In that case move to Redis (Upstash etc.) —
 * the interface is kept stable so the swap stays easy.
 */

interface Hit {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Hit>();

// Periodically drop expired entries so memory doesn't grow unbounded
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;

  for (const [key, hit] of buckets) {
    if (hit.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  return {
    allowed: true,
    remaining: limit - existing.count,
    retryAfterSeconds: 0,
  };
}

/**
 * Call at the start of a route. Returns a 429 response if the limit is
 * exceeded, otherwise null — meaning carry on.
 */
export function enforceRateLimit(
  request: NextRequest,
  scope: string,
  options: { limit: number; windowMs: number; identifier?: string }
): NextResponse | null {
  const identifier = options.identifier || getClientIp(request);
  const result = rateLimit(
    `${scope}:${identifier}`,
    options.limit,
    options.windowMs
  );

  if (result.allowed) return null;

  return NextResponse.json(
    {
      success: false,
      error: `Too many requests. Please try again in ${result.retryAfterSeconds}s.`,
    },
    {
      status: 429,
      headers: { 'Retry-After': String(result.retryAfterSeconds) },
    }
  );
}
