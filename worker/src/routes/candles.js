import { getCandles, candleTtl, normalizeInterval } from '../biquote.js';
import { ApiError, parseIntParam, validateSymbol } from '../util.js';

export async function handler(req, env, url) {
  const symbol = (url.searchParams.get('symbol') ?? '').trim().toUpperCase();
  if (!symbol) throw new ApiError(400, 'missing_symbol', 'Query parameter "symbol" is required.');
  validateSymbol(symbol);

  const interval = normalizeInterval(url.searchParams.get('interval'));
  const limit = parseIntParam(url, 'limit', 300, 1, 1000);
  const from = url.searchParams.get('from') || undefined;
  const to = url.searchParams.get('to') || undefined;

  const data = await getCandles(symbol, interval, limit);

  return {
    symbol: data.symbol,
    interval: data.interval,
    count: data.bars.length,
    bars: data.bars
  };
}

export function ttlFor(url) {
  return candleTtl(normalizeInterval(url.searchParams.get('interval')));
}
