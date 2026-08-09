import { describe, expect, it } from "vitest";
import { getPayPeriodForDate, getWeeksInPeriod, shiftPayPeriod } from "./payPeriod";

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe("getPayPeriodForDate", () => {
  it("resolves the example pay period 2026-07-26 - 2026-08-08 for a date in the middle", () => {
    const { start, end } = getPayPeriodForDate(new Date("2026-08-05T00:00:00Z"));
    expect(ymd(start)).toBe("2026-07-26");
    expect(ymd(end)).toBe("2026-08-08");
  });

  it("resolves the same period for the boundary Sunday and Saturday", () => {
    expect(ymd(getPayPeriodForDate(new Date("2026-07-26T00:00:00Z")).start)).toBe("2026-07-26");
    expect(ymd(getPayPeriodForDate(new Date("2026-08-08T00:00:00Z")).end)).toBe("2026-08-08");
  });

  it("resolves the prior period correctly (Sunday-Saturday, 14 days)", () => {
    const { start, end } = getPayPeriodForDate(new Date("2026-07-20T00:00:00Z"));
    expect(ymd(start)).toBe("2026-07-12");
    expect(ymd(end)).toBe("2026-07-25");
  });

  it("resolves the next period correctly", () => {
    const { start, end } = getPayPeriodForDate(new Date("2026-08-09T00:00:00Z"));
    expect(ymd(start)).toBe("2026-08-09");
    expect(ymd(end)).toBe("2026-08-22");
  });
});

describe("shiftPayPeriod", () => {
  it("moves to the adjacent 14-day period", () => {
    const current = getPayPeriodForDate(new Date("2026-08-05T00:00:00Z"));
    const next = shiftPayPeriod(current.start, 1);
    expect(ymd(next.start)).toBe("2026-08-09");
    const prev = shiftPayPeriod(current.start, -1);
    expect(ymd(prev.start)).toBe("2026-07-12");
  });
});

describe("getWeeksInPeriod", () => {
  it("splits the period into its two Sunday-Saturday weeks", () => {
    const { week1, week2 } = getWeeksInPeriod(new Date("2026-07-26T00:00:00Z"));
    expect(ymd(week1.start)).toBe("2026-07-26");
    expect(ymd(week1.end)).toBe("2026-08-01");
    expect(ymd(week2.start)).toBe("2026-08-02");
    expect(ymd(week2.end)).toBe("2026-08-08");
  });
});
