import assert from 'node:assert';
import { decodeFrames, encodeFrame, invocationFrame, handshakeFrame } from '../src/signalr.js';
import { normalizeTick, normalizeInterval } from '../src/biquote.js';
import { parseSymbolsParam } from '../src/util.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS', name);
  } catch (e) {
    console.error('FAIL', name, '-', e.message);
    process.exitCode = 1;
  }
}

test('signalr handshake frame', () => {
  assert.strictEqual(handshakeFrame, '{"protocol":"json","version":1}\x1e');
});

test('signalr round-trip single frame', () => {
  const raw = invocationFrame('Subscribe', [['EURUSD', 'XAUUSD']]);
  const frames = decodeFrames(raw);
  assert.strictEqual(frames.length, 1);
  assert.deepStrictEqual(frames[0].arguments, [['EURUSD', 'XAUUSD']]);
});

test('signalr batched frames split correctly', () => {
  const raw =
    JSON.stringify({ type: 1, target: 'ReceiveTick', arguments: [{ symbol: 'EURUSD' }] }) +
    '\x1e' +
    JSON.stringify({ type: 6 }) +
    '\x1e' +
    '{}\x1e';
  const frames = decodeFrames(raw);
  assert.strictEqual(frames.length, 3);
  assert.strictEqual(frames[0].target, 'ReceiveTick');
  assert.strictEqual(frames[1].type, 6);
  assert.deepStrictEqual(frames[2], {});
});

test('decode ignores malformed partial frames', () => {
  assert.deepStrictEqual(decodeFrames('{"type":6}\x1e{"trunc'), [{ type: 6 }]);
});

const SAMPLE_TICK = {
  symbol: 'EURUSD',
  description: 'Euro vs US Dollar',
  bid: 1.08542,
  ask: 1.08548,
  mid: 1.08545,
  spread: 0.00006,
  last: 0,
  volume: 0,
  high: 1.088,
  low: 1.0853,
  direction: 'UP',
  dayDiffPercent: -0.09,
  timestamp: '2026-02-24T10:30:00Z',
  marketState: 'open',
  stale: false,
  quoteAgeSeconds: 0
};

test('tick normalization maps dayDiffPercent to changePercent', () => {
  const tick = normalizeTick(SAMPLE_TICK);
  assert.strictEqual(tick.changePercent, -0.09);
  assert.strictEqual(tick.mid, 1.08545);
  assert.ok(!('dayDiffPercent' in tick));
  assert.ok(!('last' in tick) && !('volume' in tick));
});

test('normalizeInterval accepts uppercase 1D and aliases', () => {
  assert.strictEqual(normalizeInterval('1D'), '1d');
  assert.strictEqual(normalizeInterval('D1'), '1d');
  assert.strictEqual(normalizeInterval('H4'), '4h');
  assert.strictEqual(normalizeInterval('15m'), '15m');
});

test('normalizeInterval rejects unknown intervals', () => {
  let threw = false;
  try {
    normalizeInterval('2h');
  } catch {
    threw = true;
  }
  assert.ok(threw);
});

function fakeRequestWithQuery(qs) {
  return new Request('https://api.example.com/api/quotes?' + qs);
}

test('parseSymbolsParam splits, trims, uppercases and dedupes', () => {
  const list = parseSymbolsParam(' eurusd , XAUUSD ,eurusd');
  assert.deepStrictEqual(list, ['EURUSD', 'XAUUSD']);
});

test('parseSymbolsParam rejects bad symbols and oversized batches', () => {
  assert.throws(() => parseSymbolsParam('EUR USD'));
  assert.throws(() => parseSymbolsParam(Array.from({ length: 41 }, (_, i) => `S${i}`).join(',')));
});

console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures)' : ''}`);
