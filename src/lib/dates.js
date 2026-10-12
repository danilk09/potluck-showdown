import { toMillis } from './scoring';

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const longFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** "Fri, Oct 2 · 6:30 PM" */
export function formatWhen(t) {
  const ms = toMillis(t);
  if (!ms) return '';
  const d = new Date(ms);
  return `${dateFmt.format(d)} · ${timeFmt.format(d)}`;
}

export function formatDate(t) {
  const ms = toMillis(t);
  return ms ? longFmt.format(new Date(ms)) : '';
}

export function formatTime(t) {
  const ms = toMillis(t);
  return ms ? timeFmt.format(new Date(ms)) : '';
}

/** "2h 14m", "3d 4h", "12m" */
export function formatDuration(ms) {
  if (ms <= 0) return '0m';
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

const pad = (n) => String(n).padStart(2, '0');

/** Timestamp -> values for <input type="date|time|datetime-local"> in local time. */
export function toInputDate(t) {
  const ms = toMillis(t);
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toInputTime(t) {
  const ms = toMillis(t);
  if (!ms) return '';
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toInputDateTime(t) {
  const ms = toMillis(t);
  return ms ? `${toInputDate(t)}T${toInputTime(t)}` : '';
}
