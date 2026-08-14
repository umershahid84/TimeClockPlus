import { env } from "../config/env";

/**
 * Wall-clock time convention used throughout this app: shift times, clock
 * in/out, etc. are stored as Date objects whose UTC component values (hour,
 * minute, ...) ARE the organization's local wall-clock numbers - UTC is
 * used purely as a neutral, DST-free container, not as a real instant
 * conversion. A supervisor who types "8:00 AM" always gets "8:00 AM" back,
 * regardless of the server's or the viewer's own timezone, and nothing
 * shown to a user is ever a raw ISO/Zulu string.
 *
 * These helpers format that convention consistently on the backend (CSV
 * exports, emails); the React client mirrors the same convention when
 * rendering API timestamps for on-screen display.
 */

export function formatLocalTime(date: Date | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatLocalDate(date: Date | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatLocalDateTime(date: Date | null | undefined): string {
  if (!date) return "";
  return `${formatLocalDate(date)} ${formatLocalTime(date)}`;
}

/**
 * REAL timestamps - kiosk clock-event punches, audit log entries, login
 * times, timesheet-approval timestamps - are true instants (`new Date()`
 * at the moment something happened), unlike the wall-clock-container
 * values above. These must be genuinely converted to the organization's
 * configured timezone (APP_TIMEZONE) for display, not just have their UTC
 * components read back. Mixing this up with formatLocalTime/Date above
 * would silently show the wrong time whenever the server's OS timezone
 * isn't already APP_TIMEZONE.
 */
export function formatInstant(date: Date | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: env.appTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * Converts a real instant into the wall-clock-container convention: a
 * Date whose UTC component values equal the wall-clock time at `date` in
 * `timeZone`. Used to fold real kiosk punch timestamps into
 * TimesheetEntry.clockIn/clockOut, which use that convention like every
 * other actual/scheduled time field in the app (see comment above).
 */
export function realInstantToWallClockContainer(date: Date, timeZone: string = env.appTimezone): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");

  return new Date(
    Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  );
}

/** The current moment, expressed in the wall-clock-container convention. */
export function nowInWallClockContainer(): Date {
  return realInstantToWallClockContainer(new Date());
}
