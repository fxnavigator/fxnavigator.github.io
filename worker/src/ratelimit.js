import { RATE_LIMIT } from './config.js';
import { ApiError } from './util.js';

const buckets = new Map();

function clientIp(req) {
  return (
    req.headers.get('CF-Connecting-IP') ||
    req.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
    'unknown'
  );
}

export function checkRateLimit(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const windowStart = Math.floor(now / RATE_LIMIT.WINDOW_MS) * RATE_LIMIT.WINDOW_MS;
  const key = `${ip}:${windowStart}`;

  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (now - v.start > RATE_LIMIT.WINDOW_MS * 2) buckets.delete(k);
    }
  }

  let entry = buckets.get(key);
  if (!entry) {
    entry = { count: 0, start: windowStart };
    buckets.set(key, entry);
  }
  entry.count += 1;

  const remaining = Math.max(0, RATE_LIMIT.MAX_REQUESTS - entry.count);
  const resetSeconds = Math.ceil((windowStart + RATE_LIMIT.WINDOW_MS - now) / 1000);

  if (entry.count > RATE_LIMIT.MAX_REQUESTS) {
    throw new ApiError(429, 'too_many_requests', 'Rate limit exceeded. Try again in a minute.', {
      retryAfter: resetSeconds
    });
  }
  return { remaining, reset: resetSeconds };
}
