// Conversions between Date objects and the string values DateTimeField uses.
const pad = (n: number) => String(n).padStart(2, "0");

export type DateTimeMode = "date" | "time" | "datetime";

export function parseValue(mode: DateTimeMode, value?: string | null): Date {
  const now = new Date();
  if (!value) {
    if (mode === "time") now.setHours(18, 30, 0, 0);
    return now;
  }
  if (mode === "time") {
    const [h, m] = value.split(":").map(Number);
    now.setHours(h, m, 0, 0);
    return now;
  }
  const [date, time = "00:00"] = value.split("T");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, m] = time.split(":").map(Number);
  return new Date(y, mo - 1, d, h, m);
}

export function toValue(mode: DateTimeMode, d: Date): string {
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (mode === "date") return date;
  if (mode === "time") return time;
  return `${date}T${time}`;
}

/** Update one half of a local date-time without shifting it through UTC. */
export function setDatePart(value?: string | null, date?: string | null): string {
  return date ? `${date}T${value?.split("T")[1] || "18:30"}` : "";
}

export function setTimePart(value?: string | null, time?: string | null, today: Date = new Date()): string {
  if (!time) return "";
  return `${value?.split("T")[0] || toValue("date", today)}T${time}`;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function formatValue(mode: DateTimeMode, value?: string | null): string {
  const d = parseValue(mode, value);
  if (mode === "date") return dateFmt.format(d);
  if (mode === "time") return timeFmt.format(d);
  return `${dateFmt.format(d)} · ${timeFmt.format(d)}`;
}

/** Today as a date value ("2026-10-21"), the earliest day a new event can use. */
export function todayValue(today: Date = new Date()): string {
  return toValue("date", today);
}

/** Typed digits shown as a clock time: "6" → "6", "630" → "6:30", "1230" → "12:30". */
export function formatTypedTime(text: string): string {
  const d = text.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, d.length - 2)}:${d.slice(-2)}`;
}

/**
 * Typed 12-hour time + AM/PM → "HH:mm" (24-hour), or null if it isn't a real
 * time. One or two digits are just the hour ("6" → 6:00).
 */
export function parseTypedTime(text: string, pm: boolean): string | null {
  const d = text.replace(/\D/g, "");
  if (!d || d.length > 4) return null;
  const [h, m] = d.length <= 2 ? [Number(d), 0] : [Number(d.slice(0, -2)), Number(d.slice(-2))];
  if (h < 1 || h > 12 || m > 59) return null;
  return `${pad((h % 12) + (pm ? 12 : 0))}:${pad(m)}`;
}

/** "18:30" → { text: "6:30", pm: true }, for showing a stored time in the typed field. */
export function toTypedTime(value?: string | null): { text: string; pm: boolean } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const h = Number(match[1]);
  return { text: `${h % 12 || 12}:${match[2]}`, pm: h >= 12 };
}

/**
 * Like setTimePart, for a typed time: an empty or half-typed time keeps the
 * chosen date ("2026-10-21T") so the form can ask for the time instead of
 * silently dropping the date.
 */
export function setTypedTimePart(value: string | null | undefined, time: string): string {
  if (time) return setTimePart(value, time);
  const date = value?.split("T")[0];
  return date ? `${date}T` : "";
}

/** A date-time with the date picked but no valid time yet. */
export function missingTime(value?: string | null): boolean {
  return Boolean(value?.endsWith("T"));
}
