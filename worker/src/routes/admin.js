import { ApiError, jsonResponse, withSecurityHeaders } from '../util.js';
import { getSymbols } from '../biquote.js';

async function upsertSymbols(db, rows) {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO symbols (name, description, type, exchange, source, is_active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       description = excluded.description,
       type = excluded.type,
       exchange = excluded.exchange,
       source = excluded.source,
       is_active = excluded.is_active,
       updated_at = excluded.updated_at`
  );
  const batches = [];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    batches.push(
      db.batch(chunk.map((s) => stmt.bind(s.name ?? s.symbol, s.description ?? '', s.type ?? '', s.exchange ?? '', s.source ?? '', 1, now)))
    );
  }
  await Promise.all(batches);
}

export async function handleAdmin(req, env, url) {
  if (req.method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Use POST.');

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const expected = await env.ADMIN_TOKEN;
  if (!expected || token !== expected) throw new ApiError(401, 'unauthorized', 'Missing or invalid ADMIN_TOKEN.');

  if (url.pathname === '/admin/sync-symbols') {
    const [active, all] = await Promise.all([
      getSymbols({ liveOnly: true }),
      getSymbols({ quotedWithinDays: '7' })
    ]);
    const merged = new Map();
    for (const s of [...(Array.isArray(all) ? all : []), ...(Array.isArray(active) ? active : [])]) {
      if (s?.name) merged.set(s.name, s);
    }
    await upsertSymbols(env.DB, [...merged.values()]);
    return { synced: merged.size };
  }

  throw new ApiError(404, 'not_found', 'Unknown admin endpoint.');
}

export async function symbolsFallbackFromDb(env) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT name, description, type, exchange, source FROM symbols WHERE is_active = 1 ORDER BY name LIMIT 2000'
    ).all();
    if (results?.length) return results;
  } catch {}
  return null;
}
