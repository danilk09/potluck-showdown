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
