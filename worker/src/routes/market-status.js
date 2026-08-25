import { getTick, getTicks } from '../biquote.js';

const PROBE_SYMBOLS = ['EURUSD', 'BTCUSD', 'XAUUSD'];

function fxWindowOpen(now) {
  const day = now.getUTCDay();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const weekMinutes = day * 1440 + minutes;
  const FRIDAY_CLOSE = 5 * 1440 + 22 * 60;
  const SUNDAY_OPEN = 6 * 1440 + 22 * 60;
  if (day === 6) return true;
  if (day === 0 && weekMinutes < SUNDAY_OPEN + 1440) return weekMinutes >= SUNDAY_OPEN;
  return weekMinutes >= SUNDAY_OPEN - 1440 || weekMinutes < FRIDAY_CLOSE;
}

function sessionsInfo(now) {
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  const t = h * 60 + m;

  const inRange = (start, end) => (start <= end ? t >= start && t < end : t >= start || t < end);

  const london = inRange(8 * 60, 16.5 * 60);
  const newYork = inRange(13.5 * 60, 20 * 60);

  return {
    sydney: { open: inRange(22 * 60, 7 * 60), hours: '22:00-07:00 UTC' },
    tokyo: { open: inRange(0, 9 * 60), hours: '00:00-09:00 UTC' },
    london: { open: london, hours: '08:00-16:30 UTC' },
    newyork: { open: newYork, hours: '13:30-20:00 UTC' },
    overlapLondonNewYork: { open: london && newYork }
  };
}

export async function handler(req, env, url) {
  const symbols = url.searchParams.get('symbols');
  const now = new Date();

  let probes = {};
  try {
    probes = await getTicks(PROBE_SYMBOLS, { allowStale: false });
  } catch {
    try {
      probes = { EURUSD: await getTick('EURUSD') };
    } catch {}
  }

  const fxOpen = fxWindowOpen(now);
  const eurusd = probes.EURUSD;
  const crypto = probes.BTCUSD;

  const markets = {
    forex: {
      open: Boolean(fxOpen || (!eurusd?.stale && eurusd?.marketState === 'open')),
      probe: eurusd ? { symbol: 'EURUSD', marketState: eurusd.marketState, quoteAgeSeconds: eurusd.quoteAgeSeconds } : null,
      note: 'Sydney-Tokyo-London-New York rotation'
    },
    metals: {
      open: fxOpen,
      probe: probes.XAUUSD ? { symbol: 'XAUUSD', marketState: probes.XAUUSD.marketState } : null
    },
    crypto: {
      open: true,
      probe: crypto ? { symbol: 'BTCUSD', marketState: crypto.marketState, quoteAgeSeconds: crypto.quoteAgeSeconds } : null,
      note: '24/7'
    },
    indices: {
      open: null,
      note: 'Varies per exchange; use quotes marketState per index symbol'
    }
  };

  const requested = symbols
    ? symbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 40)
    : [];

  let perSymbol = null;
  if (requested.length) {
    const ticks = await getTicks(requested);
    perSymbol = Object.fromEntries(
      Object.entries(ticks).map(([sym, tick]) => [
        sym,
        {
          marketState: tick?.marketState ?? 'unknown',
          stale: tick?.stale ?? true,
          quoteAgeSeconds: tick?.quoteAgeSeconds ?? null
        }
      ])
    );
  }

  return {
    utcNow: now.toISOString(),
    markets,
    sessions: sessionsInfo(now),
    symbols: perSymbol
  };
}
