import { getSymbols, getSymbol } from '../biquote.js';
import { ApiError, parseIntParam, validateSymbol } from '../util.js';
import { TTL } from '../config.js';
import { symbolsFallbackFromDb } from './admin.js';

const TYPES = new Set(['Forex', 'Stock', 'Crypto', 'Index', 'Commodity']);

export async function handler(req, env, url) {
  const q = url.searchParams.get('q')?.trim();
  const name = url.searchParams.get('name')?.trim().toUpperCase();

  if (name) {
    validateSymbol(name);
    try {
      return { symbol: await getSymbol(name) };
    } catch (err) {
      if (err instanceof ApiError && err.status < 500) throw err;
      const db = await symbolsFallbackFromDb(env);
      const match = db?.find((s) => s.name === name);
      if (!match) throw err;
      return { symbol: { ...match, snapshot: true } };
    }
  }

  const type = url.searchParams.get('type');
  if (type && !TYPES.has(type)) {
    throw new ApiError(400, 'invalid_type', `type must be one of: ${[...TYPES].join(', ')}`);
  }

  const params = {
    type,
    source: url.searchParams.get('source') || undefined,
    exchange: url.searchParams.get('exchange') || undefined,
    liveOnly: url.searchParams.get('liveOnly') === 'true',
    quotedWithinDays: url.searchParams.get('quotedWithinDays') || '7',
    search: q || undefined,
    limit: parseIntParam(url, 'limit', q ? 25 : 500, 1, 2000)
  };

  try {
    return {
      query: q ?? null,
      symbols: await getSymbols(params)
    };
  } catch (err) {
    if (err instanceof ApiError && err.status < 500) throw err;
    const db = await symbolsFallbackFromDb(env);
    if (!db) throw err;
    let list = db;
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter(
        (s) => s.name.toLowerCase().includes(needle) || (s.description || '').toLowerCase().includes(needle)
      );
    }
    if (params.type) list = list.filter((s) => s.type === params.type);
    return { query: q ?? null, symbols: list.slice(0, params.limit), snapshot: true };
  }
}

export function ttlFor(url) {
  return url.searchParams.get('q') || url.searchParams.get('name') ? TTL.QUOTES : TTL.SYMBOLS;
}
