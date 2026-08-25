export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function jsonResponse(data, { status = 200, headers = {}, req } = {}) {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json; charset=utf-8');
  if (req) applyCors(req, h);
  return new Response(JSON.stringify(data), { status, headers: h });
}

export function errorResponse(err, req) {
  const status = err instanceof ApiError ? err.status : 502;
  const code = err instanceof ApiError ? err.code : 'upstream_error';
  const body = {
    ok: false,
    error: code,
    message: err.message || 'Unexpected error'
  };
  if (err instanceof ApiError && err.extra) Object.assign(body, err.extra);
  return jsonResponse(body, { status, req });
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY'
};

export function withSecurityHeaders(res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

export function applyCors(req, headers) {
  const origins = (globalThis.env?.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim());
  const origin = req.headers.get('Origin');
  if (!origin) return;
  if (origins.includes('*')) {
    headers.set('Access-Control-Allow-Origin', '*');
  } else if (origins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Credentials', 'false');
  }
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Max-Age', '86400');
}

export function preflight(req) {
  const h = new Headers();
  applyCors(req, h);
  return new Response(null, { status: 204, headers: h });
}

export function parseSymbolsParam(value, max = 40) {
  if (!value) throw new ApiError(400, 'missing_symbols', 'Query parameter "symbols" is required.');
  const list = value
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const unique = [...new Set(list)];
  if (!unique.length) throw new ApiError(400, 'empty_symbols', 'No valid symbols provided.');
  if (unique.length > max) throw new ApiError(400, 'too_many_symbols', `Maximum ${max} symbols per request.`);
  for (const s of unique) validateSymbol(s);
  return unique;
}

const SYMBOL_RE = /^[A-Z0-9._-]{2,20}$/;

export function validateSymbol(symbol) {
  if (!SYMBOL_RE.test(symbol)) {
    throw new ApiError(400, 'invalid_symbol', `Invalid symbol format: ${symbol}`);
  }
  return symbol;
}

export function parseIntParam(url, name, fallback, min, max) {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ApiError(400, 'invalid_param', `${name} must be an integer between ${min} and ${max}.`);
  }
  return n;
}
