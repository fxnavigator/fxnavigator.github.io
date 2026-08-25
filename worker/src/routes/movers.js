import { getMovers, getMarketSummary } from '../biquote.js';
import { ApiError, parseIntParam } from '../util.js';

const KINDS = new Set(['gainers', 'losers', 'most-active']);

export async function handler(req, env, url) {
  const kind = (url.searchParams.get('kind') ?? '').trim();
  if (!KINDS.has(kind)) {
    throw new ApiError(400, 'invalid_kind', `kind must be one of: ${[...KINDS].join(', ')}`);
  }

  const type = url.searchParams.get('type') || undefined;
  const exchange = url.searchParams.get('exchange') || undefined;
  const limit = parseIntParam(url, 'limit', 10, 1, 100);

  if (url.searchParams.get('summary') === 'true') {
    return { summary: await getMarketSummary() };
  }

  const data = await getMovers(kind, { type, exchange, limit });

  return {
    kind,
    period: data.period ?? '1D',
    count: data.items.length,
    items: data.items
  };
}
