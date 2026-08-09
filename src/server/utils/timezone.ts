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
 * rendering API timestamps for on-screen display. APP_TIMEZONE identifies
 * the organization's operating timezone for labeling purposes (e.g. report
 * headers) but is not used to shift the stored values.
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
