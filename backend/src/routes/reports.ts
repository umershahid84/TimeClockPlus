import { Router } from "express";
import { Parser as CsvParser } from "json2csv";
import { prisma } from "../config/prisma";
import { assertLineOfBusinessAccess, requireAuth } from "../middleware/auth";
import { resolveScheduleForDate } from "./schedules";
import { sumDecimalHours } from "../utils/time";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

function parseDateRange(req: import("express").Request) {
  const start = new Date(String(req.query.start));
  const end = new Date(String(req.query.end));
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return { start, end };
}

/**
 * Schedule report: for each day in the range, resolves the schedule that was
 * ACTUALLY in effect on that date (not just the employee's current schedule),
 * per the historical-data requirement.
 */
reportsRouter.get("/schedule", async (req, res) => {
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
        segmentStart: segmentStart.toISOString().slice(0, 10),
        segmentEnd: segmentEnd.toISOString().slice(0, 10),
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
          segmentStart: range.start.toISOString().slice(0, 10),
          segmentEnd: range.end.toISOString().slice(0, 10),
          employmentStatus: current.employmentStatus,
          shiftStartTime: current.shiftStartTime,
          shiftEndTime: current.shiftEndTime,
          daysOff: current.daysOff,
        });
      }
    }
  }

  if (req.query.format === "csv") {
    const csv = new CsvParser().parse(rows);
    res.header("Content-Type", "text/csv");
    res.attachment("schedule-report.csv");
    return res.send(csv);
  }
  res.json(rows);
});

/** Timesheet/payroll report: biweekly-friendly, decimal hours throughout. */
reportsRouter.get("/timesheet", async (req, res) => {
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
        include: { entries: true },
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
          workDate: entry.workDate.toISOString().slice(0, 10),
          clockIn: entry.clockIn.toISOString(),
          clockOut: entry.clockOut.toISOString(),
          unpaidBreakMins: entry.unpaidBreakMins,
          decimalHours: Number(entry.decimalHours),
          notes: entry.notes ?? "",
        });
      }
      const total = sumDecimalHours(timesheet.entries.map((e) => Number(e.decimalHours)));
      rows.push({
        employeeCode: employee.employeeCode,
        firstName: employee.firstName,
        lastName: employee.lastName,
        lineOfBusiness: employee.lineOfBusiness.name,
        workDate: "TOTAL",
        clockIn: "",
        clockOut: "",
        unpaidBreakMins: "",
        decimalHours: total,
        notes: `Period ${timesheet.periodStart.toISOString().slice(0, 10)} - ${timesheet.periodEnd.toISOString().slice(0, 10)} (${timesheet.status})`,
      });
    }
  }

  if (req.query.format === "csv") {
    const csv = new CsvParser().parse(rows);
    res.header("Content-Type", "text/csv");
    res.attachment("timesheet-report.csv");
    return res.send(csv);
  }
  res.json(rows);
});
