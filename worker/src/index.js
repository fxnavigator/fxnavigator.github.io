import { cached, setWaitUntil } from './cache.js';
import { checkRateLimit } from './ratelimit.js';
import {
  ApiError,
  applyCors,
  errorResponse,
  jsonResponse,
  preflight,
  withSecurityHeaders
} from './util.js';
import { TTL } from './config.js';
import * as quotes from './routes/quotes.js';
import * as candles from './routes/candles.js';
import * as symbols from './routes/symbols.js';
import * as news from './routes/news.js';
import * as calendar from './routes/calendar.js';
import * as movers from './routes/movers.js';
import * as marketStatus from './routes/market-status.js';
import { handleStream } from './routes/stream.js';
import { handleAdmin } from './routes/admin.js';

export default {
  async fetch(request, env, ctx) {
    globalThis.env = env;
    setWaitUntil(ctx.waitUntil.bind(ctx));

    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return withSecurityHeaders(preflight(request));

    try {
      if (url.pathname === '/ws/stream') {
        return handleStream(request);
      }

      if (url.pathname === '/health') {
        return withSecurityHeaders(
          jsonResponse({ ok: true, service: 'fxnavigator-api', utc: new Date().toISOString() }, { req: request })
        );
      }

      if (url.pathname.startsWith('/admin/')) {
        return withSecurityHeaders(
          jsonResponse({ ok: true, ...(await handleAdmin(request, env, url)) }, { req: request })
        );
      }

      const route = ROUTES[url.pathname];
      if (!route) throw new ApiError(404, 'not_found', `Unknown endpoint ${url.pathname}`);

      if (request.method !== 'GET') throw new ApiError(405, 'method_not_allowed', 'Use GET.');

      const limit = checkRateLimit(request);
      const ttl = route.ttl ? route.ttl(url) : 60;

      const res = await cachedGet(request, env, ttl, () => route.dispatch(request, env, url), limit);
      return withSecurityHeaders(res);
    } catch (err) {
      return withSecurityHeaders(errorResponse(err, request));
    }
  }
};

async function cachedGet(req, env, ttl, producer, limit) {
  const res = await cached(req, env, ttl, producer);
  res.headers.set('X-RateLimit-Remaining', String(limit.remaining));
  res.headers.set('X-RateLimit-Reset', String(limit.reset));
  applyCors(req, res.headers);
  return res;
}

const ROUTES = {
  '/api/quotes': {
    dispatch: quotes.handler,
    ttl: () => TTL.QUOTES
  },
  '/api/candles': {
    dispatch: candles.handler,
    ttl: candles.ttlFor
  },
  '/api/symbols': {
    dispatch: symbols.handler,
    ttl: symbols.ttlFor
  },
  '/api/news': {
    dispatch: news.handler,
    ttl: () => TTL.NEWS
  },
  '/api/calendar': {
    dispatch: calendar.handler,
    ttl: () => TTL.CALENDAR
  },
  '/api/movers': {
    dispatch: movers.handler,
    ttl: () => TTL.MOVERS
  },
  '/api/market-status': {
    dispatch: marketStatus.handler,
    ttl: () => TTL.MARKET_STATUS
  }
};
