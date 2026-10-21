// Conversions between Date objects and the string values DateTimeField uses.
const pad = (n) => String(n).padStart(2, '0');

export function parseValue(mode, value) {
  const now = new Date();
  if (!value) {
    if (mode === 'time') now.setHours(18, 30, 0, 0);
    return now;
  }
  if (mode === 'time') {
    const [h, m] = value.split(':').map(Number);
    now.setHours(h, m, 0, 0);
    return now;
  }
  const [date, time = '00:00'] = value.split('T');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, m);
}

export function toValue(mode, d) {
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (mode === 'date') return date;
  if (mode === 'time') return time;
  return `${date}T${time}`;
}

/** Update one half of a local date-time without shifting it through UTC. */
export function setDatePart(value, date) {
  return date ? `${date}T${value?.split('T')[1] || '18:30'}` : '';
}

export function setTimePart(value, time, today = new Date()) {
  if (!time) return '';
  return `${value?.split('T')[0] || toValue('date', today)}T${time}`;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function formatValue(mode, value) {
  const d = parseValue(mode, value);
  if (mode === 'date') return dateFmt.format(d);
  if (mode === 'time') return timeFmt.format(d);
  return `${dateFmt.format(d)} · ${timeFmt.format(d)}`;
}
