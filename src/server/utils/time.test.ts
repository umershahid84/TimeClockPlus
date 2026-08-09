import { describe, expect, it } from "vitest";
import { calculateDecimalHours, resolveShiftTimes, roundTo } from "./time";

describe("calculateDecimalHours", () => {
  it("converts common durations to decimal hours", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const minutes = (m: number) => new Date(base.getTime() + m * 60000);
    expect(calculateDecimalHours(base, minutes(15))).toBe(0.25);
    expect(calculateDecimalHours(base, minutes(30))).toBe(0.5);
    expect(calculateDecimalHours(base, minutes(45))).toBe(0.75);
    expect(calculateDecimalHours(base, minutes(60))).toBe(1);
    expect(calculateDecimalHours(base, minutes(450))).toBe(7.5);
    expect(calculateDecimalHours(base, minutes(480))).toBe(8);
    expect(calculateDecimalHours(base, minutes(525))).toBe(8.75);
  });

  it("handles the 15:00-23:30 example with a 30 minute break = 8.00", () => {
    const { start, end } = resolveShiftTimes(new Date("2026-01-01T00:00:00Z"), "15:00", "23:30");
    expect(calculateDecimalHours(start, end, 30)).toBe(8);
  });

  it("handles the 15:00-23:45 example with a 30 minute break = 8.25", () => {
    const { start, end } = resolveShiftTimes(new Date("2026-01-01T00:00:00Z"), "15:00", "23:45");
    expect(calculateDecimalHours(start, end, 30)).toBe(8.25);
  });

  it("handles overnight shifts crossing midnight (22:00-06:30, 30 min break = 8.00)", () => {
    const { start, end } = resolveShiftTimes(new Date("2026-01-01T00:00:00Z"), "22:00", "06:30");
    expect(end.getUTCDate()).toBe(2); // rolled to the next day
    expect(calculateDecimalHours(start, end, 30)).toBe(8);
  });

  it("rejects a clockOut before clockIn", () => {
    const clockIn = new Date("2026-01-01T12:00:00Z");
    const clockOut = new Date("2026-01-01T11:00:00Z");
    expect(() => calculateDecimalHours(clockIn, clockOut)).toThrow();
  });
});

describe("roundTo", () => {
  it("rounds to two decimal places by default", () => {
    expect(roundTo(8.1234)).toBe(8.12);
    expect(roundTo(8.126)).toBe(8.13);
    expect(roundTo(1.001)).toBe(1);
  });
});
