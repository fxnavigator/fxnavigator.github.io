import { getTicks } from '../biquote.js';
import { ApiError, parseSymbolsParam, parseIntParam } from '../util.js';
import { DEFAULT_GROUPS } from '../config.js';

export async function handler(req, env, url) {
  const allowStale = url.searchParams.get('allowStale') !== 'false';
  const groupParam = url.searchParams.get('group');

  let symbols;
  if (groupParam) {
    const group = DEFAULT_GROUPS[groupParam.toLowerCase()];
    if (!group) throw new ApiError(400, 'unknown_group', `Unknown group "${groupParam}".`);
    symbols = group;
  } else {
    symbols = parseSymbolsParam(url.searchParams.get('symbols'));
  }

  const ticks = await getTicks(symbols, { allowStale });
  let quotes = symbols.map((s) => ticks[s] ?? null).filter(Boolean);

  return {
    count: quotes.length,
    requested: symbols.length,
    quotes
  };
}
