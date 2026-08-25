export const UPSTREAM_BASE = 'https://biquote.io';
export const HUB_PATH = '/hubs/tick';

export const TTL = {
  QUOTES: 5,
  CANDLES: { '1m': 10, '5m': 30, '15m': 60, '30m': 120, '1h': 300, '4h': 900, '1d': 3600 },
  SYMBOLS: 86400,
  MOVERS: 60,
  MARKET_SUMMARY: 60,
  NEWS: 300,
  CALENDAR: 600,
  MARKET_STATUS: 20
};

export const INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

export const MAX_SYMBOLS_PER_REQUEST = 40;

export const DEFAULT_GROUPS = {
  forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'EURJPY'],
  gold: ['XAUUSD', 'XAUEUR', 'XAGUSD', 'XPTUSD', 'XPDUSD'],
  crypto: ['BTCUSD', 'ETHUSD', 'XRPUSD', 'LTCUSD', 'BCHUSD', 'ADAUSD'],
  indices: ['US30', 'NAS100', 'SPX500', 'GER40', 'UK100', 'JP225']
};

export const NEWS_DEFAULT_LANGUAGE = 'en';
export const NEWS_DEFAULT_COUNTRY = 'US';

export const RATE_LIMIT = {
  WINDOW_MS: 60_000,
  MAX_REQUESTS: 240
};

export const UPSTREAM_TIMEOUT_MS = 8000;
