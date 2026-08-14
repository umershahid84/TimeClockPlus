/**
 * Wall-clock time convention: the API stores/returns shift and clock
 * in/out timestamps as ISO strings whose UTC component values ARE the
 * organization's local wall-clock numbers (UTC is used purely as a
 * neutral, DST-free container - see src/server/utils/timezone.ts for the
 * server-side half of this convention). Formatting here MUST read the
 * UTC components (timeZone: "UTC"), not the browser's local timezone, so
 * a supervisor sees exactly the time that was recorded - e.g. "8:00 AM" -
 * never a shifted value and never a raw "...Z" ISO string.
 */

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  return `${formatDate(value)} ${formatTime(value)}`;
}

/** "YYYY-MM-DD" from an ISO string/Date, reading UTC components (see convention note above). */
export function toDateInputValue(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** "HH:MM" (24h, for <input type="time">) from an ISO string/Date, reading UTC components. */
export function toTimeInputValue(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/**
 * Formats a REAL instant (kiosk punches, audit log timestamps, login
 * times) in the organization's actual configured timezone - genuine
 * conversion, unlike formatTime/formatDate above which just read UTC
 * components back out of the wall-clock-container convention. `timezone`
 * comes from useAppConfig() (see context/AppConfigContext.tsx).
 */
export function formatInstant(value: string | Date | null | undefined, timezone: string): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}
