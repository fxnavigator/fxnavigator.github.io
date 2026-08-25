export const RECORD_SEPARATOR = '\x1e';

export const handshakeFrame = JSON.stringify({ protocol: 'json', version: 1 }) + RECORD_SEPARATOR;
export const pingFrame = JSON.stringify({ type: 6 }) + RECORD_SEPARATOR;

export function encodeFrame(obj) {
  return JSON.stringify(obj) + RECORD_SEPARATOR;
}

export function invocationFrame(target, args) {
  return encodeFrame({ type: 1, target, arguments: args });
}

/**
 * SignalR batches frames inside a single websocket message.
 * Returns parsed objects; the JSON-protocol handshake completion arrives
 * as an empty object `{}` (no `type` field).
 */
export function decodeFrames(text) {
  if (!text) return [];
  const out = [];
  for (const part of text.split(RECORD_SEPARATOR)) {
    if (!part) continue;
    try {
      out.push(JSON.parse(part));
    } catch {
      // ignore malformed partial frames
    }
  }
  return out;
}
