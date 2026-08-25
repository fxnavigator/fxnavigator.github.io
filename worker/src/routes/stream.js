import { UPSTREAM_BASE, HUB_PATH } from '../config.js';
import { validateSymbol } from '../util.js';
import { normalizeTick } from '../biquote.js';
import { encodeFrame, decodeFrames, handshakeFrame, pingFrame, invocationFrame } from '../signalr.js';

const MAX_CLIENT_SYMBOLS = 40;
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000];

const hub = {
  socket: null,
  status: 'idle',
  clients: new Set(),
  refCounts: new Map(),
  attempt: 0,
  reconnectTimer: null,
  keepaliveTimer: null
};

function upstreamWsUrl(connectionToken) {
  const base = UPSTREAM_BASE.replace(/^http/, 'ws');
  return `${base}${HUB_PATH}?id=${encodeURIComponent(connectionToken)}`;
}

async function negotiate() {
  const res = await fetch(`${UPSTREAM_BASE}${HUB_PATH}/negotiate?negotiateVersion=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error(`negotiate failed: ${res.status}`);
  const data = await res.json();
  return data.connectionToken ?? data.connectionId;
}

function refsToSymbols() {
  return [...hub.refCounts.entries()].filter(([, n]) => n > 0).map(([s]) => s);
}

function sendRaw(text) {
  try {
    hub.socket?.send(text);
    return true;
  } catch {
    return false;
  }
}

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const client of hub.clients) {
    try {
      if (client.socket.readyState === 1) {
        if (message.type !== 'tick' || client.symbols.has(message.data.symbol)) {
          client.socket.send(payload);
        }
      }
    } catch {}
  }
}

function scheduleReconnect() {
  if (hub.reconnectTimer || !hub.clients.size) return;
  const delay = RECONNECT_DELAYS_MS[Math.min(hub.attempt, RECONNECT_DELAYS_MS.length - 1)];
  hub.status = 'reconnecting';
  notifyClients({ type: 'status', state: 'reconnecting', attempt: hub.attempt + 1 });
  hub.reconnectTimer = setTimeout(async () => {
    hub.reconnectTimer = null;
    await connectUpstream().catch(() => {});
  }, delay);
}

async function connectUpstream() {
  cleanupSocket();

  let token;
  try {
    token = await negotiate();
  } catch (err) {
    hub.attempt += 1;
    scheduleReconnect();
    return;
  }

  let socket;
  try {
    const res = await fetch(upstreamWsUrl(token), {
      headers: { Upgrade: 'websocket' }
    });
    socket = res.webSocket;
    if (!socket) throw new Error('no websocket returned');
    socket.accept();
  } catch {
    hub.attempt += 1;
    scheduleReconnect();
    return;
  }

  hub.socket = socket;
  hub.status = 'handshaking';

  socket.addEventListener('open', () => {
    sendRaw(handshakeFrame);
  });

  socket.addEventListener('message', (event) => {
    for (const frame of decodeFrames(typeof event.data === 'string' ? event.data : '')) {
      handleUpstreamFrame(frame);
    }
  });

  socket.addEventListener('close', () => {
    stopKeepalive();
    hub.socket = null;
    if (hub.clients.size) {
      hub.status = 'disconnected';
      notifyClients({ type: 'status', state: 'reconnecting' });
      scheduleReconnect();
    } else {
      hub.status = 'idle';
    }
  });

  socket.addEventListener('error', () => {});

  startKeepalive();
}

function handleUpstreamFrame(frame) {
  switch (frame.type) {
    case undefined:
    case null: {
      hub.status = 'connected';
      hub.attempt = 0;
      startKeepalive();
      const symbols = refsToSymbols();
      if (symbols.length) {
        sendRaw(invocationFrame('Subscribe', [symbols]));
        notifyClients({ type: 'status', state: 'connected', symbols });
      }
      break;
    }
    case 1: {
      if (frame.target === 'ReceiveTick') {
        const raw = Array.isArray(frame.arguments) ? frame.arguments[0] : null;
        const tick = normalizeTick(raw);
        if (tick?.symbol && hub.refCounts.get(tick.symbol.toUpperCase()) > 0) {
          broadcast({ type: 'tick', data: tick });
        }
      }
      break;
    }
    case 6:
      sendRaw(pingFrame);
      break;
    case 7:
      try {
        hub.socket?.close(1000);
      } catch {}
      break;
    default:
      break;
  }
}

function startKeepalive() {
  if (hub.keepaliveTimer) return;
  hub.keepaliveTimer = setInterval(() => {
    sendRaw(pingFrame);
  }, 15000);
}

function stopKeepalive() {
  if (hub.keepaliveTimer) {
    clearInterval(hub.keepaliveTimer);
    hub.keepaliveTimer = null;
  }
}

function cleanupSocket() {
  stopKeepalive();
  if (hub.socket) {
    try {
      hub.socket.close(1000);
    } catch {}
    hub.socket = null;
  }
}

function changeSubscription(client, symbols, add) {
  const valid = [];
  for (const symbol of symbols) {
    try {
      valid.push(validateSymbol(String(symbol).toUpperCase()));
    } catch {}
  }

  for (const symbol of valid) {
    const current = hub.refCounts.get(symbol) ?? 0;
    const next = add ? current + 1 : Math.max(0, current - 1);
    hub.refCounts.set(symbol, next);
  }
  for (const [symbol, count] of hub.refCounts) {
    if (count <= 0) hub.refCounts.delete(symbol);
  }

  if (!add) {
    for (const symbol of valid) client.symbols.delete(symbol);
  } else {
    for (const symbol of valid) client.symbols.add(symbol);
  }

  if (hub.status === 'connected') {
    if (valid.length) {
      sendRaw(invocationFrame(add ? 'Subscribe' : 'Unsubscribe', [valid]));
    }
  } else if (add) {
    connectUpstream().catch(() => {});
  }
}

function notifyClients(message) {
  const payload = JSON.stringify(message);
  for (const client of hub.clients) {
    try {
      if (client.socket.readyState === 1) client.socket.send(payload);
    } catch {}
  }
}

export async function handleStream(req) {
  const upgradeHeader = req.headers.get('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const pair = new WebSocketPair();
  const server = pair[1];
  server.accept();

  const client = { socket: server, symbols: new Set() };
  hub.clients.add(client);

  server.send(JSON.stringify({ type: 'hello', version: 1 }));

  server.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
    } catch {
      return;
    }
    switch (msg.type) {
      case 'ping':
        try { server.send(JSON.stringify({ type: 'pong', utc: new Date().toISOString() })); } catch {}
        break;
      case 'subscribe': {
        const list = Array.isArray(msg.symbols) ? msg.symbols : [];
        if (client.symbols.size + list.length > MAX_CLIENT_SYMBOLS) {
          try { server.send(JSON.stringify({ type: 'error', message: `Max ${MAX_CLIENT_SYMBOLS} symbols` })); } catch {}
          break;
        }
        changeSubscription(client, list, true);
        try { server.send(JSON.stringify({ type: 'subscribed', symbols: [...client.symbols] })); } catch {}
        break;
      }
      case 'unsubscribe':
        changeSubscription(client, Array.isArray(msg.symbols) ? msg.symbols : [], false);
        break;
      default:
        break;
    }
  });

  const closeHandler = () => {
    hub.clients.delete(client);
    changeSubscription(client, [...client.symbols], false);
    if (!hub.clients.size) {
      cleanupSocket();
      hub.status = 'idle';
    }
  };
  server.addEventListener('close', closeHandler);
  server.addEventListener('error', closeHandler);

  if (!hub.socket && hub.clients.size === 1) {
    connectUpstream().catch(() => {});
  }

  return new Response(null, { status: 101, webSocket: pair[0] });
}
