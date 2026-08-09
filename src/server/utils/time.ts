/**
 * Decimal-hour time calculations.
 *
 * Business rule (see requirements doc, section 21): compute hours from the
 * actual clock-in/clock-out instants (never from pre-rounded times), then
 * convert to decimal and round only the final result to the configured
 * precision (default 2 places). Overnight shifts must resolve correctly
 * without treating the end time as "before" the start time.
 */

const DEFAULT_PRECISION = Number(process.env.DECIMAL_HOURS_PRECISION ?? 2);

export function roundTo(value: number, precision: number = DEFAULT_PRECISION): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Combine a work date + "HH:MM" time-of-day into a concrete Date.
 * If the resulting instant would be earlier than `after`, roll it forward
 * one day — this is what lets a shift like 22:00 -> 06:30 span midnight
 * without the caller having to special-case it.
 */
export function resolveShiftTimes(
  workDate: Date,
  startHHMM: string,
  endHHMM: string
): { start: Date; end: Date } {
  const start = combineDateAndTime(workDate, startHHMM);
  let end = combineDateAndTime(workDate, endHHMM);
  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  return { start, end };
}

/** Exported for callers (e.g. timesheet entry edits) that need to combine a work date with a single HH:MM time. */
export function combineDateAndTime(date: Date, hhmm: string): Date {
  const [hours, minutes] = parseHHMM(hhmm);
  const result = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes, 0, 0)
  );
  return result;
}

function parseHHMM(hhmm: string): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) throw new Error(`Invalid time format: "${hhmm}", expected HH:MM`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Invalid time value: "${hhmm}"`);
  return [hours, minutes];
}

/**
 * Core payroll calculation: given a clock-in instant, clock-out instant,
 * and unpaid break minutes, return decimal hours worked.
 * clockOut may be on the following calendar day (overnight shift) — this
 * function only cares about the elapsed duration between two instants.
 */
export function calculateDecimalHours(
  clockIn: Date,
  clockOut: Date,
  unpaidBreakMinutes = 0,
  precision: number = DEFAULT_PRECISION
): number {
  const rawMinutes = (clockOut.getTime() - clockIn.getTime()) / 60000;
  if (rawMinutes < 0) {
    throw new Error("clockOut must not be before clockIn");
  }
  const paidMinutes = Math.max(0, rawMinutes - unpaidBreakMinutes);
  return roundTo(paidMinutes / 60, precision);
}

/** Sum an array of already-rounded decimal hours, rounding the total once more. */
export function sumDecimalHours(hours: number[], precision: number = DEFAULT_PRECISION): number {
  const total = hours.reduce((acc, h) => acc + h, 0);
  return roundTo(total, precision);
}

/**
 * Split actual worked hours into Regular vs. Overtime relative to the
 * scheduled shift length: hours up to the scheduled length are Regular,
 * anything beyond it is OT. If there is no scheduled shift to compare
 * against, all worked time is treated as Regular (OT can't be determined).
 */
export function splitRegularAndOvertime(
  workedHours: number,
  scheduledHours: number | null,
  precision: number = DEFAULT_PRECISION
): { regularHours: number; otHours: number } {
  if (scheduledHours === null || scheduledHours <= 0) {
    return { regularHours: roundTo(workedHours, precision), otHours: 0 };
  }
  const regularHours = roundTo(Math.min(workedHours, scheduledHours), precision);
  const otHours = roundTo(Math.max(0, workedHours - scheduledHours), precision);
  return { regularHours, otHours };
}

export const DAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type DayCode = (typeof DAY_CODES)[number];

export function parseDaysOff(daysOff: string): DayCode[] {
  return daysOff
    .split(",")
    .map((d) => d.trim().toUpperCase())
    .filter((d): d is DayCode => (DAY_CODES as readonly string[]).includes(d));
}
