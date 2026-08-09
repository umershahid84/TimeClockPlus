import { describe, expect, it } from "vitest";
import { calculateDecimalHours, resolveShiftTimes, roundTo, splitRegularAndOvertime } from "./time";

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

describe("splitRegularAndOvertime", () => {
  it("treats hours within the scheduled shift as all Regular", () => {
    expect(splitRegularAndOvertime(8.42, 8.5)).toEqual({ regularHours: 8.42, otHours: 0 });
  });

  it("classifies hours beyond the scheduled shift as OT (08:00-17:30 vs 08:00-16:30 scheduled)", () => {
    expect(splitRegularAndOvertime(9, 8)).toEqual({ regularHours: 8, otHours: 1 });
  });

  it("treats all worked time as Regular when there is no scheduled shift to compare", () => {
    expect(splitRegularAndOvertime(6.5, null)).toEqual({ regularHours: 6.5, otHours: 0 });
  });

  it("splits an early-in/late-out overnight shift correctly when the same break applies to both scheduled and actual (regression: was 10.50/1.50 instead of 10.00/2.00)", () => {
    // Scheduled: 2:00 PM - 12:30 AM (10.5 raw hours), actual: 1:00 PM - 1:30 AM
    // (12.5 raw hours) - a 30-minute unpaid break applies to both.
    const scheduled = resolveShiftTimes(new Date("2026-01-01T00:00:00Z"), "14:00", "00:30");
    const actual = resolveShiftTimes(new Date("2026-01-01T00:00:00Z"), "13:00", "01:30");
    const scheduledHours = calculateDecimalHours(scheduled.start, scheduled.end, 30);
    const workedHours = calculateDecimalHours(actual.start, actual.end, 30);
    expect(scheduledHours).toBe(10);
    expect(workedHours).toBe(12);
    expect(splitRegularAndOvertime(workedHours, scheduledHours)).toEqual({ regularHours: 10, otHours: 2 });
  });
});
