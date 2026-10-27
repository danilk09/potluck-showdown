import { describe, expect, it } from "vitest";
import { parseValue, setDatePart, setTimePart, toValue } from "../../src/components/dateTimeValue";

describe("mobile date and time values", () => {
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
