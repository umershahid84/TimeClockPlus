import { Router } from "express";
import { Parser as CsvParser } from "json2csv";
import { prisma } from "../config/prisma";
import { assertLineOfBusinessAccess, requireAuth } from "../middleware/auth";
import { resolveScheduleForDate } from "./schedules";
import { sumDecimalHours } from "../utils/time";
import { formatLocalDate, formatLocalTime } from "../utils/timezone";
import { asyncHandler } from "../utils/asyncHandler";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

function parseDateRange(req: import("express").Request) {
  const start = new Date(String(req.query.start));
  const end = new Date(String(req.query.end));
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return { start, end };
}

const SCHEDULE_REPORT_FIELDS = [
  "employeeCode",
  "firstName",
  "lastName",
  "lineOfBusiness",
  "segmentStart",
  "segmentEnd",
  "employmentStatus",
  "shiftStartTime",
  "shiftEndTime",
  "daysOff",
];

const TIMESHEET_REPORT_FIELDS = [
  "employeeCode",
  "firstName",
  "lastName",
  "lineOfBusiness",
  "workDate",
  "scheduledClockIn",
  "scheduledClockOut",
  "actualClockIn",
  "actualClockOut",
  "unpaidBreakMins",
  "regularHours",
  "otHours",
  "totalWorkedHours",
  "attendanceAdjustment",
  "supplementalType",
  "supplementalHours",
  "timeType",
  "notes",
];

/**
 * Schedule report: for each day in the range, resolves the schedule that was
 * ACTUALLY in effect on that date (not just the employee's current schedule),
 * per the historical-data requirement. All dates/times are rendered in the
 * organization's local wall-clock convention - never a raw ISO/UTC value.
 */
reportsRouter.get("/schedule", asyncHandler(async (req, res) => {
  const range = parseDateRange(req);
  if (!range) return res.status(400).json({ error: "start and end query params are required" });
  const lineOfBusinessId = req.query.lineOfBusinessId ? Number(req.query.lineOfBusinessId) : undefined;
  const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;

  if (lineOfBusinessId !== undefined && !assertLineOfBusinessAccess(req.user!, lineOfBusinessId)) {
    return res.status(403).json({ error: "Not authorized for this line of business" });
  }

  const employees = await prisma.employee.findMany({
    where: {
      ...(employeeId ? { id: employeeId } : {}),
      ...(lineOfBusinessId ? { lineOfBusinessId } : {}),
      ...(req.user!.isAdministrator || req.user!.canViewAllLinesOfBiz
        ? {}
        : { lineOfBusinessId: { in: req.user!.lineOfBusinessIds } }),
    },
    include: { lineOfBusiness: true },
  });

  const rows: Record<string, unknown>[] = [];
  for (const employee of employees) {
    // Sample the schedule at the range start and at every schedule change
    // that falls within the range, so multi-period reports show each
    // effective-dated segment distinctly (per requirement section 4/18).
    const schedules = await prisma.employeeSchedule.findMany({
      where: {
        employeeId: employee.id,
        OR: [
          { effectiveDate: { lte: range.end }, endDate: null },
          { effectiveDate: { lte: range.end }, endDate: { gt: range.start } },
        ],
      },
      orderBy: { effectiveDate: "asc" },
    });
    for (const schedule of schedules) {
      const segmentStart = schedule.effectiveDate > range.start ? schedule.effectiveDate : range.start;
      const segmentEnd = schedule.endDate && schedule.endDate < range.end ? schedule.endDate : range.end;
      rows.push({
        employeeCode: employee.employeeCode,
        firstName: employee.firstName,
        lastName: employee.lastName,
        lineOfBusiness: employee.lineOfBusiness.name,
        segmentStart: formatLocalDate(segmentStart),
        segmentEnd: formatLocalDate(segmentEnd),
        employmentStatus: schedule.employmentStatus,
        shiftStartTime: schedule.shiftStartTime,
        shiftEndTime: schedule.shiftEndTime,
        daysOff: schedule.daysOff,
      });
    }
    if (schedules.length === 0) {
      const current = await resolveScheduleForDate(employee.id, range.end);
      if (current) {
        rows.push({
          employeeCode: employee.employeeCode,
          firstName: employee.firstName,
          lastName: employee.lastName,
          lineOfBusiness: employee.lineOfBusiness.name,
          segmentStart: formatLocalDate(range.start),
          segmentEnd: formatLocalDate(range.end),
          employmentStatus: current.employmentStatus,
          shiftStartTime: current.shiftStartTime,
          shiftEndTime: current.shiftEndTime,
          daysOff: current.daysOff,
        });
      }
    }
  }

  if (req.query.format === "csv") {
    // Explicit fields (rather than inferring columns from rows[0]) keep
    // column order stable and, importantly, avoid json2csv throwing when
    // an employee/period has zero rows (e.g. no schedule on file yet).
    const csv = new CsvParser({ fields: SCHEDULE_REPORT_FIELDS }).parse(rows);
    res.header("Content-Type", "text/csv");
    res.attachment("schedule-report.csv");
    return res.send(csv);
  }
  res.json(rows);
}));

const ATTENDANCE_LABELS: Record<string, string> = {
  NONE: "",
  TARDY: "Tardy",
  LEFT_EARLY: "Left Early",
  ARRIVED_LATE: "Arrived Late",
};

const TIME_TYPE_LABELS: Record<string, string> = {
  REGULAR_SHIFT: "Regular Shift",
  SICK: "Sick",
  FCA: "FCA",
  FMLA: "FMLA",
  NO_CALL_NO_SHOW: "No Call - No Show",
  BEREAVEMENT: "Bereavement",
  LWOP: "LWOP",
  PTO: "PTO",
  PERSONAL_HOLIDAY: "Personal Holiday",
  HOLIDAY: "Holiday",
  JURY_DUTY: "Jury Duty",
  MATERNITY: "Maternity",
  PATERNITY: "Paternity",
  MILITARY: "Military",
  OTHERS: "Others",
};

/**
 * Timesheet/payroll report: biweekly-friendly, decimal hours throughout,
 * with Scheduled vs. Actual, Regular/OT split, attendance adjustment, and
 * supplemental time all broken out per day. All clock times are rendered
 * in local wall-clock form - never UTC/Zulu.
 */
reportsRouter.get("/timesheet", asyncHandler(async (req, res) => {
  const range = parseDateRange(req);
  if (!range) return res.status(400).json({ error: "start and end query params are required" });
  const lineOfBusinessId = req.query.lineOfBusinessId ? Number(req.query.lineOfBusinessId) : undefined;
  const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;

  if (lineOfBusinessId !== undefined && !assertLineOfBusinessAccess(req.user!, lineOfBusinessId)) {
    return res.status(403).json({ error: "Not authorized for this line of business" });
  }

  const employees = await prisma.employee.findMany({
    where: {
      ...(employeeId ? { id: employeeId } : {}),
      ...(lineOfBusinessId ? { lineOfBusinessId } : {}),
      ...(req.user!.isAdministrator || req.user!.canViewAllLinesOfBiz
        ? {}
        : { lineOfBusinessId: { in: req.user!.lineOfBusinessIds } }),
    },
    include: {
      lineOfBusiness: true,
      timesheets: {
        where: { periodStart: { gte: range.start }, periodEnd: { lte: range.end } },
        include: { entries: { orderBy: { workDate: "asc" } } },
      },
    },
  });

  const rows: Record<string, unknown>[] = [];
  for (const employee of employees) {
    for (const timesheet of employee.timesheets) {
      for (const entry of timesheet.entries) {
        rows.push({
          employeeCode: employee.employeeCode,
          firstName: employee.firstName,
          lastName: employee.lastName,
          lineOfBusiness: employee.lineOfBusiness.name,
          workDate: formatLocalDate(entry.workDate),
          scheduledClockIn: formatLocalTime(entry.scheduledClockIn),
          scheduledClockOut: formatLocalTime(entry.scheduledClockOut),
          actualClockIn: formatLocalTime(entry.clockIn),
          actualClockOut: formatLocalTime(entry.clockOut),
          unpaidBreakMins: entry.unpaidBreakMins,
          regularHours: Number(entry.regularHours),
          otHours: Number(entry.otHours),
          totalWorkedHours: Number(entry.decimalHours),
          attendanceAdjustment: ATTENDANCE_LABELS[entry.attendanceAdjustment] ?? entry.attendanceAdjustment,
          supplementalType: entry.supplementalType === "NONE" ? "" : entry.supplementalType,
          supplementalHours: Number(entry.supplementalHours),
          timeType: TIME_TYPE_LABELS[entry.timeType] ?? entry.timeType,
          notes: entry.notes ?? "",
        });
      }
      const totalRegular = sumDecimalHours(timesheet.entries.map((e) => Number(e.regularHours)));
      const totalOt = sumDecimalHours(timesheet.entries.map((e) => Number(e.otHours)));
      const totalWorked = sumDecimalHours(timesheet.entries.map((e) => Number(e.decimalHours)));
      const totalSupplemental = sumDecimalHours(timesheet.entries.map((e) => Number(e.supplementalHours)));
      rows.push({
        employeeCode: employee.employeeCode,
        firstName: employee.firstName,
        lastName: employee.lastName,
        lineOfBusiness: employee.lineOfBusiness.name,
        workDate: `TOTAL (Pay Period ${formatLocalDate(timesheet.periodStart)} - ${formatLocalDate(timesheet.periodEnd)}, ${timesheet.status})`,
        scheduledClockIn: "",
        scheduledClockOut: "",
        actualClockIn: "",
        actualClockOut: "",
        unpaidBreakMins: "",
        regularHours: totalRegular,
        otHours: totalOt,
        totalWorkedHours: totalWorked,
        attendanceAdjustment: "",
        supplementalType: "",
        supplementalHours: totalSupplemental,
        timeType: "",
        notes: "",
      });
    }
  }

  if (req.query.format === "csv") {
    const csv = new CsvParser({ fields: TIMESHEET_REPORT_FIELDS }).parse(rows);
    res.header("Content-Type", "text/csv");
    res.attachment("timesheet-report.csv");
    return res.send(csv);
  }
  res.json(rows);
}));
