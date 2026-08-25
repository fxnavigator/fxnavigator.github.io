export function cacheKey(req, variant = '') {
  const url = new URL(req.url);
  const keyUrl = new URL(url.pathname + url.search, 'https://cache.internal');
  if (variant) keyUrl.searchParams.set('__v', variant);
  return new Request(keyUrl.toString(), { method: 'GET' });
}

async function fromEdge(req) {
  const cache = caches.default;
  return cache.match(cacheKey(req));
}

async function toEdge(req, res, ttl) {
  const cache = caches.default;
  const stored = new Response(res.clone().body, res);
  stored.headers.set('Cache-Control', `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl}`);
  await cache.put(cacheKey(req), stored);
}

async function fromKv(env, req) {
  if (!env?.CACHE_KV) return null;
  const raw = await env.CACHE_KV.get(`resp:${cacheKey(req).url}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return null;
  }
}

async function toKv(env, req, data, ttl) {
  if (!env?.CACHE_KV) return;
  const payload = JSON.stringify({ data, cachedAt: Date.now() });
  try {
    await env.CACHE_KV.put(`resp:${cacheKey(req).url}`, payload, { expirationTtl: Math.max(60, ttl * 6) });
  } catch {}
}

function freshHeaders(ttl) {
  return {
    'Cache-Control': `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${Math.min(ttl * 4, 300)}`
  };
}

/**
 * Cache-aside with two layers:
 *   1. Cloudflare edge cache (caches.default) - fastest, per-PoP
 *   2. Workers KV                              - shared across PoPs
 *
 * On upstream failure a stale KV value is served with X-Stale-If-Error: 1.
 */
export async function cached(req, env, ttl, producer) {
  const edge = await fromEdge(req);
  if (edge) {
    const hit = new Response(edge.body, edge);
    hit.headers.set('X-Cache', 'EDGE');
    return hit;
  }

  let kvEntry = await fromKv(env, req);
  if (kvEntry && Date.now() - kvEntry.cachedAt < ttl * 1000) {
    const res = jsonResponseLike(kvEntry.data, req, {
      ...freshHeaders(ttl),
      'X-Cache': 'KV',
      Age: String(Math.floor((Date.now() - kvEntry.cachedAt) / 1000))
    });
    ctxWaitUntil(toEdge(req, res.clone(), ttl));
    return res;
  }

  let produced;
  try {
    produced = await producer();
  } catch (err) {
    if (kvEntry) {
      const staleAge = Math.floor((Date.now() - kvEntry.cachedAt) / 1000);
      return jsonResponseLike(kvEntry.data, req, {
        ...freshHeaders(ttl),
        'X-Cache': 'STALE',
        'X-Stale-If-Error': '1',
        'X-Stale-Age': String(staleAge)
      });
    }
    throw err;
  }

  const body = produced.body ?? produced;
  const headers = { ...(produced.headers ?? {}), ...freshHeaders(ttl), 'X-Cache': 'MISS' };
  const res = jsonResponseLike(body, req, headers);

  ctxWaitUntil(Promise.allSettled([toEdge(req, res.clone(), ttl), toKv(env, req, body, ttl)]));
  return res;
}

function jsonResponseLike(data, req, headers) {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify({ ok: true, ...(typeof data === 'object' && !Array.isArray(data) ? data : { data }) }), {
    headers: h
  });
}

let waitUntilFn = () => {};
export function setWaitUntil(fn) {
  waitUntilFn = fn;
}
function ctxWaitUntil(promise) {
  try {
    waitUntilFn(promise);
  } catch {}
}
