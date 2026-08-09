import { env } from "../config/env";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = 14;

/** Midnight UTC for a given "calendar day" - used to do whole-day arithmetic without DST/TZ drift. */
function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * Pay periods run Sunday through Saturday, 14 days long, tiled back-to-back
 * from a known anchor Sunday (PAY_PERIOD_ANCHOR). Given any date, this
 * resolves the 14-day period it falls within.
 */
export function getPayPeriodForDate(date: Date): { start: Date; end: Date } {
  const anchor = utcMidnight(new Date(env.payPeriodAnchor));
  const target = utcMidnight(date);

  const daysSinceAnchor = Math.floor((target.getTime() - anchor.getTime()) / DAY_MS);
  const periodIndex = Math.floor(daysSinceAnchor / PERIOD_DAYS);

  const start = addDays(anchor, periodIndex * PERIOD_DAYS);
  const end = addDays(start, PERIOD_DAYS - 1); // inclusive Saturday
  return { start, end };
}

export function shiftPayPeriod(periodStart: Date, direction: 1 | -1): { start: Date; end: Date } {
  const shifted = addDays(utcMidnight(periodStart), direction * PERIOD_DAYS);
  return getPayPeriodForDate(shifted);
}

export function getWeeksInPeriod(periodStart: Date): { week1: { start: Date; end: Date }; week2: { start: Date; end: Date } } {
  const start = utcMidnight(periodStart);
  return {
    week1: { start, end: addDays(start, 6) },
    week2: { start: addDays(start, 7), end: addDays(start, 13) },
  };
}
