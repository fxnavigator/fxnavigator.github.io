# FXNavigator API — Cloudflare Worker

Serverless API gateway between the FXNavigator frontend and [BiQuote](https://biquote.io/docs/) market data.
No traditional backend: the Worker handles upstream calls, normalization, caching, rate control and WebSocket streaming.

```
FXNavigator Frontend ──► Cloudflare Worker ──► BiQuote REST + SignalR
                              │
                        KV (cache) · D1 (symbols/history)
```

## Routes

| Endpoint | Description | Cache TTL | Upstream |
|---|---|---|---|
| `GET /api/quotes?symbols=EURUSD,XAUUSD` | Bid / Ask / Mid / Spread / Daily change / High / Low (+`group=forex\|metals\|crypto\|indices`) | **5 s** | `/api/latest` (batched) |
| `GET /api/candles?symbol=&interval=&limit=` | OHLC candles — intervals `1m 5m 15m 30m 1h 4h 1d` (`1D` accepted) | 10 s – 1 h by interval | `/api/{symbol}/ohlc` |
| `GET /api/symbols[?q=][&type=][&name=]` | Symbol catalogue / search / detail; D1 snapshot fallback on upstream outage | 24 h (search 5 s) | `/api/symbols*` |
| `GET /api/news[?symbol=&maxResults=]` | Market & symbol news | **5 min** | `/api/news/market` |
| `GET /api/calendar[?importance=high&upcoming=true&countries=US,EU]` | Events with actual / forecast / previous | 10 min | `/api/calendar*` |
| `GET /api/movers?kind=gainers\|losers\|most-active` | Market movers | 60 s | `/api/market/*` |
| `GET /api/market-status` | Forex/metals/crypto open state, session windows (UTC), per-symbol probe | 20 s | computed + probes |
| `WS /ws/stream?symbols=` | Live ticks: BiQuote SignalR hub bridged to a plain-JSON WebSocket | — | `/hubs/tick` |

Extras: `GET /health`, `POST /admin/sync-symbols` (requires secret `ADMIN_TOKEN`) to snapshot the symbol catalogue into D1.

### WebSocket client protocol

```js
const ws = new WebSocket('wss://<worker-domain>/ws/stream');
ws.send(JSON.stringify({ type: 'subscribe', symbols: ['EURUSD', 'XAUUSD'] }));
ws.onmessage = e => {
  const msg = JSON.parse(e.data);
  // { type:'hello' } | { type:'subscribed', symbols } | { type:'tick', data:{ symbol,bid,ask,mid,... } }
  // { type:'status', state:'connected'|'reconnecting' } | { type:'pong' }
};
```

The Worker keeps **one shared SignalR connection per isolate**, reference-counts subscriptions across
all clients, normalizes ticks (`dayDiffPercent → changePercent`, drops unusable `last/volume`),
filters server pings and auto-reconnects with backoff.

## Deploy

```bash
cd worker
npm install

# create bindings, then paste ids into wrangler.toml
npx wrangler kv namespace create CACHE_KV     # -> id
npx wrangler d1 create fxnavigator            # -> database_id
npx wrangler d1 execute fxnavigator --remote --file=db/schema.sql

# optional admin token for /admin/*
npx wrangler secret put ADMIN_TOKEN

npm run deploy                                # wrangler deploy
```

Then either:
- paste the workers.dev URL into the "API endpoint" field on `/markets.html` (stored in localStorage), or
- add a custom domain route so the site can call it same-origin as `/api/*`
  (`routes` in `wrangler.toml`, requires the zone on Cloudflare).

Set `ALLOWED_ORIGINS` in `[vars]` to your production origins (CORS allow-list).

## Performance & security notes

- All responses carry `s-maxage` + `stale-while-revalidate`; edge cache is checked first, then KV,
  then upstream. On upstream failure a stale KV value is served with `X-Stale-If-Error`.
- Quotes are batched through one `/api/latest` call regardless of symbol count.
- Per-IP fixed-window limiter (soft, per-isolate) returns 429 with `Retry-After`.
- CORS is an explicit allow-list; responses include `nosniff`, `DENY` frame options and strict referrer policy.
- BiQuote credentials never touch the browser: the upstream base URL lives only in the Worker.
- Responses are compressed automatically by Cloudflare's CDN.

## Local development

```bash
npm run dev        # wrangler dev — emulates KV/D1 locally at :8787
npm test           # pure-logic smoke tests (SignalR frames, tick normalization, validation)
```

Test the stream locally: open `https://fxnavigator.local.test` style page or use `wscat -c ws://127.0.0.1:8787/ws/stream`
and send `{"type":"subscribe","symbols":["EURUSD"]}`.
