const config = require('../config');

/** Composants de date dans le fuseau donné. */
function zonedParts(date, tz = config.timezone) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    dayOfWeek: dow,
  };
}

/** Décalage (ms) du fuseau par rapport à UTC à l'instant donné. */
function tzOffsetMs(date, tz = config.timezone) {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Construit la Date UTC correspondant à y-m-d hh:mm dans le fuseau donné. */
function zonedDate(year, month, day, hour, minute, tz = config.timezone) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = tzOffsetMs(guess, tz);
  return new Date(guess.getTime() - offset);
}

function parseHHmm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return { h, mi };
}

/** Début et fin de la journée locale contenant `date`. */
function localDayBounds(date = new Date(), tz = config.timezone) {
  const p = zonedParts(date, tz);
  const start = zonedDate(p.year, p.month, p.day, 0, 0, tz);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, end, parts: p };
}

module.exports = { zonedParts, zonedDate, parseHHmm, localDayBounds, tzOffsetMs };
