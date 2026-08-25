import { getCalendar, getCalendarUpcoming } from '../biquote.js';
import { ApiError, parseIntParam } from '../util.js';

const IMPORTANCE = new Set(['low', 'medium', 'high']);
const TYPES = new Set(['event', 'indicator', 'holiday']);

function isoDaysFromNow(days, midnight = true) {
  const d = new Date();
  if (midnight) d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export async function handler(req, env, url) {
  const upcoming = url.searchParams.get('upcoming') === 'true';
  const countries = url.searchParams.get('countries')?.trim() || undefined;
  const importance = url.searchParams.get('importance')?.trim() || undefined;
  const type = url.searchParams.get('type')?.trim() || undefined;

  if (importance && !IMPORTANCE.has(importance)) {
    throw new ApiError(400, 'invalid_importance', `importance must be one of: ${[...IMPORTANCE].join(', ')}`);
  }
  if (type && !TYPES.has(type)) {
    throw new ApiError(400, 'invalid_type', `type must be one of: ${[...TYPES].join(', ')}`);
  }

  let events;
  if (upcoming) {
    events = await getCalendarUpcoming({
      limit: parseIntParam(url, 'limit', 30, 1, 500),
      countries,
      importance
    });
  } else {
    const from = url.searchParams.get('from') || isoDaysFromNow(-1);
    const to = url.searchParams.get('to') || isoDaysFromNow(7);
    for (const [label, value] of [['from', from], ['to', to]]) {
      if (Number.isNaN(Date.parse(value))) {
        throw new ApiError(400, 'invalid_date', `${label} must be ISO 8601.`);
      }
    }
    events = await getCalendar({
      from,
      to,
      countries: countries ? countries.split(',').map((c) => c.trim()).filter(Boolean).join(',') : undefined,
      importance,
      type,
      limit: parseIntParam(url, 'limit', 200, 1, 500)
    });
  }

  return {
    upcoming,
    filters: { countries: countries ?? null, importance: importance ?? null, type: type ?? null },
    count: Array.isArray(events) ? events.length : 0,
    events
  };
}
