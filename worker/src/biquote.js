import { UPSTREAM_BASE, TTL, INTERVALS } from './config.js';
import { ApiError } from './util.js';

export function normalizeInterval(raw) {
  if (!raw) return '1h';
  const v = String(raw).trim().toLowerCase();
  const map = { '1min': '1m', '5min': '5m', '15min': '15m', '30min': '30m', h1: '1h', h4: '4h', d1: '1d', '1d': '1d' };
  const interval = map[v] ?? v;
  if (!INTERVALS.includes(interval)) {
    throw new ApiError(400, 'invalid_interval', `Unsupported interval "${raw}". Allowed: ${INTERVALS.join(', ')}`);
  }
  return interval;
}

function upstreamUrl(path, params) {
  const url = new URL(UPSTREAM_BASE + path);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request(path, params) {
  const url = upstreamUrl(path, params);
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'FXNavigator-Worker/1.0' },
      signal: AbortSignal.timeout(8000)
    });
  } catch (cause) {
    throw new ApiError(504, 'upstream_timeout', 'BiQuote did not respond in time.', { detail: String(cause) });
  }

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? 60);
    throw new ApiError(429, 'rate_limited', 'Upstream rate limit reached. Retry shortly.', { retryAfter });
  }
  if (res.status === 404) {
    throw new ApiError(404, 'not_found', 'Unknown or inactive symbol.');
  }
  if (!res.ok) {
    let message = `Upstream error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message || body?.error) message = body.message || body.error;
    } catch {}
    throw new ApiError(res.status >= 500 ? 502 : res.status, 'upstream_error', message);
  }
  return res.json();
}

export function normalizeTick(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    symbol: raw.symbol,
    description: raw.description ?? '',
    bid: raw.bid,
    ask: raw.ask,
    mid: raw.mid,
    spread: raw.spread,
    changePercent: raw.dayDiffPercent,
    high: raw.high,
    low: raw.low,
    direction: raw.direction ?? 'FLAT',
    marketState: raw.marketState ?? 'unknown',
    stale: Boolean(raw.stale),
    quoteAgeSeconds: raw.quoteAgeSeconds ?? null,
    timestamp: raw.timestamp ?? null
  };
}

export async function getTicks(symbols, { allowStale = true } = {}) {
  const data = await request('/api/latest', { symbols, allowStale: allowStale ? undefined : false });
  const out = {};
  for (const [symbol, tick] of Object.entries(data ?? {})) {
    out[symbol.toUpperCase()] = normalizeTick(tick);
  }
  return out;
}

export async function getTick(symbol, { allowStale = true } = {}) {
  const raw = await request(`/api/${encodeURIComponent(symbol)}`, { allowStale: allowStale ? undefined : false });
  return normalizeTick(raw);
}

export function candleTtl(interval) {
  return TTL.CANDLES[interval] ?? 300;
}

export async function getCandles(symbol, interval, limit) {
  const data = await request(`/api/${encodeURIComponent(symbol)}/ohlc`, { interval, limit });
  return {
    symbol: data.symbol ?? symbol,
    interval: data.interval ?? interval,
    bars: Array.isArray(data.bars) ? data.bars : []
  };
}

export async function getSymbols({ type, source, exchange, liveOnly, quotedWithinDays, search, limit }) {
  if (search) {
    return request('/api/symbols/search', { q: search, liveOnly: liveOnly || undefined, limit });
  }
  return request('/api/symbols', {
    type,
    source,
    exchange,
    liveOnly: liveOnly || undefined,
    quotedWithinDays
  });
}

export async function getSymbol(name) {
  return request(`/api/symbols/${encodeURIComponent(name)}`);
}

function normalizeMover(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    symbol: raw.symbol,
    description: raw.description ?? raw.name ?? '',
    type: raw.type ?? null,
    exchange: raw.exchange ?? null,
    lastPrice: raw.lastPrice,
    changePercent: raw.changePercent,
    changeAmount: raw.changeAmount ?? null,
    high: raw.high ?? null,
    low: raw.low ?? null
  };
}

export async function getMovers(kind, { type, exchange, limit }) {
  const data = await request(`/api/market/${kind}`, { type, exchange, limit });
  const rows = Array.isArray(data) ? data : (data.items ?? data.data ?? []);
  return {
    period: data?.period ?? '1D',
    items: rows.map(normalizeMover).filter(Boolean)
  };
}

export async function getMarketSummary() {
  return request('/api/market/summary');
}

export async function getNews({ symbol, language, country, maxResults }) {
  return request('/api/news/market', { symbol, language, country, maxResults });
}

export async function getCalendar({ from, to, countries, importance, type, limit }) {
  return request('/api/calendar', { from, to, countries, importance, type, limit });
}

export async function getCalendarUpcoming({ limit, countries, importance }) {
  return request('/api/calendar/upcoming', { limit, countries, importance });
}

export async function getHealth() {
  return request('/health');
}
