const defaultZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const formatters = new Map();

function formatter(zone) {
  if (!formatters.has(zone)) {
    formatters.set(zone, new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23'
    }));
  }
  return formatters.get(zone);
}

function wallTime(instant, zone) {
  const fields = Object.fromEntries(formatter(zone).formatToParts(instant)
    .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  return Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second);
}

function calendarDay(instant, zone) {
  return new Date(Math.floor(wallTime(instant, zone) / 86_400_000) * 86_400_000);
}

function localInstant(day, time, zone) {
  const [hour, minute] = time.split(':').map(Number);
  const target = +day + (hour * 60 + minute) * 60_000;
  const offsets = new Set([-1, 0, 1].map(days => {
    const sample = target + days * 86_400_000;
    return wallTime(new Date(sample), zone) - sample;
  }));
  const matches = [...offsets].map(offset => target - offset)
    .filter(candidate => wallTime(new Date(candidate), zone) === target);
  // An ambiguous wall time uses the earlier instant. A nonexistent time has no slot boundary.
  return matches.length ? new Date(Math.min(...matches)) : null;
}

function parseLocalDateTime(value, zone) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [date, time] = value.split('T');
  const day = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(+day) || day.toISOString().slice(0, 10) !== date) return null;
  return localInstant(day, time, zone);
}

function fitsHours(start, end, weeklyHours, zone) {
  const day = calendarDay(start, zone);
  return weeklyHours.some(range => {
    if (range.dayOfWeek !== day.getUTCDay()) return false;
    const opens = localInstant(day, range.startTime, zone);
    const closes = localInstant(day, range.endTime, zone);
    return opens && closes && start >= opens && end <= closes;
  });
}

function normalizeHours(hours) {
  const hhmm = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!Array.isArray(hours) || hours.length > 70 || hours.some(range => !range
    || !Number.isInteger(range.dayOfWeek) || range.dayOfWeek < 0 || range.dayOfWeek > 6
    || !hhmm.test(range.startTime) || !hhmm.test(range.endTime) || range.startTime >= range.endTime)) return null;
  const sorted = hours.map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
  if (sorted.some((range, index) => index && sorted[index - 1].dayOfWeek === range.dayOfWeek
      && sorted[index - 1].endTime > range.startTime)) return null;
  return sorted;
}

module.exports = { defaultZone, formatter, calendarDay, localInstant, parseLocalDateTime, fitsHours, normalizeHours };
