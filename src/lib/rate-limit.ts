/**
 * In-memory sliding-window rate limiter. Single-process app (one Next
 * server behind the tunnel) so a Map is sufficient — no Redis needed.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = { limit: number; windowMs: number };

export function consumeRateLimit(
  key: string,
  opts: RateLimitOptions,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + opts.windowMs };
    buckets.set(key, bucket);
    return { allowed: true, remaining: opts.limit - 1, resetAt: bucket.resetAt };
  }
  existing.count += 1;
  const allowed = existing.count <= opts.limit;
  return { allowed, remaining: Math.max(0, opts.limit - existing.count), resetAt: existing.resetAt };
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
