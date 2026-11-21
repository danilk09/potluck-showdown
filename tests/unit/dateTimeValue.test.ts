import { describe, expect, it } from "vitest";
import { formatTypedTime, fromMilitary, parseTypedTime, parseValue, setDatePart, setTimePart, toTypedTime, toValue, setTypedTimePart, missingTime } from "../../src/components/dateTimeValue";

describe("mobile date and time values", () => {
  it("turns a typed 24-hour time into 12-hour with AM/PM picked", () => {
    expect(fromMilitary("13:00")).toEqual({ text: "1:00", pm: true });
    expect(fromMilitary("23:45")).toEqual({ text: "11:45", pm: true });
    expect(fromMilitary("00:30")).toEqual({ text: "12:30", pm: false });
    // Ordinary 12-hour times are left alone.
    expect(fromMilitary("6:30")).toBeNull();
    expect(fromMilitary("12:15")).toBeNull();
    expect(fromMilitary("24:00")).toBeNull();
    // Mid-typing, "13" might still become "1:30", so it waits until the field is left.
    expect(fromMilitary("13")).toBeNull();
    expect(fromMilitary("13", true)).toEqual({ text: "1:00", pm: true });
  });

  it("round trips local dates and times without changing the selected hour", () => {
    expect(toValue("date", parseValue("date", "2026-10-21"))).toBe("2026-10-21");
    expect(toValue("time", parseValue("time", "09:05"))).toBe("09:05");
    expect(toValue("datetime", parseValue("datetime", "2026-10-21T18:30"))).toBe("2026-10-21T18:30");
  });

  it("keeps the time when the date changes and supplies a time for a new selection", () => {
    expect(setDatePart("2026-10-21T09:05", "2026-11-02")).toBe("2026-11-02T09:05");
    expect(setDatePart("", "2026-11-02")).toBe("2026-11-02T18:30");
  });

  it("keeps the date when the time changes, including when time is chosen first", () => {
    expect(setTimePart("2026-10-21T18:30", "07:15")).toBe("2026-10-21T07:15");
    expect(setTimePart("", "07:15", new Date(2026, 9, 21))).toBe("2026-10-21T07:15");
  });

  it("clears an optional schedule when either selected part is cleared", () => {
    expect(setDatePart("2026-10-21T18:30", "")).toBe("");
    expect(setTimePart("2026-10-21T18:30", "")).toBe("");
  });
});

describe("typed 12-hour times", () => {
  it("formats digits as they are typed", () => {
    expect(formatTypedTime("6")).toBe("6");
    expect(formatTypedTime("63")).toBe("63");
    expect(formatTypedTime("630")).toBe("6:30");
    expect(formatTypedTime("1230")).toBe("12:30");
    expect(formatTypedTime("12:305")).toBe("12:30");
  });

  it("converts to 24-hour values using AM/PM", () => {
    expect(parseTypedTime("6:30", true)).toBe("18:30");
    expect(parseTypedTime("6:30", false)).toBe("06:30");
    expect(parseTypedTime("12:00", false)).toBe("00:00");
    expect(parseTypedTime("12:15", true)).toBe("12:15");
    expect(parseTypedTime("7", true)).toBe("19:00");
  });

  it("rejects times that don't exist", () => {
    expect(parseTypedTime("", true)).toBeNull();
    expect(parseTypedTime("0:30", true)).toBeNull();
    expect(parseTypedTime("13:00", true)).toBeNull();
    expect(parseTypedTime("6:75", true)).toBeNull();
    expect(parseTypedTime("63", true)).toBeNull();
  });

  it("shows stored times in 12-hour form", () => {
    expect(toTypedTime("18:30")).toEqual({ text: "6:30", pm: true });
    expect(toTypedTime("00:05")).toEqual({ text: "12:05", pm: false });
    expect(toTypedTime("12:00")).toEqual({ text: "12:00", pm: true });
    expect(toTypedTime("")).toBeNull();
  });
});

describe("typed times inside a date-time", () => {
  it("keeps the date while the time is empty or half typed", () => {
    expect(setTypedTimePart("2026-10-21T18:30", "")).toBe("2026-10-21T");
    expect(missingTime("2026-10-21T")).toBe(true);
    expect(setTypedTimePart("2026-10-21T", "07:15")).toBe("2026-10-21T07:15");
    expect(missingTime("2026-10-21T07:15")).toBe(false);
    expect(setTypedTimePart("", "")).toBe("");
  });
});
