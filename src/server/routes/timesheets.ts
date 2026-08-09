import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { assertLineOfBusinessAccess, requireAuth } from "../middleware/auth";
import { recordAudit } from "../services/audit";
import { resolveScheduleForDate } from "./schedules";
import { calculateDecimalHours, combineDateAndTime, resolveShiftTimes, splitRegularAndOvertime, sumDecimalHours } from "../utils/time";
import { getPayPeriodForDate } from "../utils/payPeriod";
import { asyncHandler } from "../utils/asyncHandler";

export const timesheetsRouter = Router();
timesheetsRouter.use(requireAuth);

async function assertEmployeeAccess(req: import("express").Request, employeeId: number) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return null;
  if (!assertLineOfBusinessAccess(req.user!, employee.lineOfBusinessId)) return null;
  return employee;
}

// Prisma's Decimal fields serialize to STRINGS through res.json() (Decimal
// defines its own toJSON()), which would otherwise silently hand the
// client "8.50" instead of 8.5 and break any .toFixed()/arithmetic call
// there. Every response that includes a TimesheetEntry must go through
// this so the client always receives real numbers.
function serializeEntry<T extends { regularHours: unknown; otHours: unknown; decimalHours: unknown; supplementalHours: unknown }>(
  entry: T
): Omit<T, "regularHours" | "otHours" | "decimalHours" | "supplementalHours"> & {
  regularHours: number;
  otHours: number;
  decimalHours: number;
  supplementalHours: number;
} {
  return {
    ...entry,
    regularHours: Number(entry.regularHours),
    otHours: Number(entry.otHours),
    decimalHours: Number(entry.decimalHours),
    supplementalHours: Number(entry.supplementalHours),
  };
}

function computeTotals(entries: { regularHours: unknown; otHours: unknown; supplementalHours: unknown; decimalHours: unknown }[]) {
  const regularHours = sumDecimalHours(entries.map((e) => Number(e.regularHours)));
  const otHours = sumDecimalHours(entries.map((e) => Number(e.otHours)));
  const supplementalHours = sumDecimalHours(entries.map((e) => Number(e.supplementalHours)));
  const totalWorked = sumDecimalHours(entries.map((e) => Number(e.decimalHours)));
  return { regularHours, otHours, supplementalHours, totalWorked, totalCredited: sumDecimalHours([totalWorked, supplementalHours]) };
}

/**
 * Pay-period view for an employee's timesheet: resolves the Sunday-Saturday
 * 14-day period containing `date` (default today) and returns whatever
 * entries already exist for it. Does not create a Timesheet row - that
 * happens lazily the first time a day is added.
 */
timesheetsRouter.get("/employee/:employeeId/pay-period", asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const employee = await assertEmployeeAccess(req, employeeId);
  if (!employee) return res.status(403).json({ error: "Not authorized or employee not found" });

  const anchorDate = req.query.date ? new Date(String(req.query.date)) : new Date();
  if (isNaN(anchorDate.getTime())) return res.status(400).json({ error: "Invalid date" });
  const { start: periodStart, end: periodEnd } = getPayPeriodForDate(anchorDate);

  const timesheet = await prisma.timesheet.findUnique({
    where: { employeeId_periodStart_periodEnd: { employeeId, periodStart, periodEnd } },
    include: { entries: { orderBy: { workDate: "asc" } } },
  });

  const entries = timesheet?.entries ?? [];
  res.json({
    employeeId,
    periodStart,
    periodEnd,
    timesheetId: timesheet?.id ?? null,
    status: timesheet?.status ?? "OPEN",
    entries: entries.map(serializeEntry),
    totals: computeTotals(entries),
  });
}));

const addDaySchema = z.object({ workDate: z.coerce.date() });

/**
 * "Add Day": creates a timesheet entry for the given date, auto-populating
 * the Scheduled Clock In/Out from the employee's schedule in effect on that
 * date. Actual Clock In/Out default to the scheduled times - a supervisor
 * edits them afterward via PUT if the employee's actual time differed.
 */
timesheetsRouter.post("/employee/:employeeId/entries", asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const employee = await assertEmployeeAccess(req, employeeId);
  if (!employee) return res.status(403).json({ error: "Not authorized or employee not found" });

  const parsed = addDaySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { workDate } = parsed.data;

  const { start: periodStart, end: periodEnd } = getPayPeriodForDate(workDate);
  const schedule = await resolveScheduleForDate(employeeId, workDate);

  let scheduledClockIn: Date | null = null;
  let scheduledClockOut: Date | null = null;
  if (schedule) {
    const shift = resolveShiftTimes(workDate, schedule.shiftStartTime, schedule.shiftEndTime);
    scheduledClockIn = shift.start;
    scheduledClockOut = shift.end;
  }

  // Actual time defaults to the scheduled shift (or, lacking a schedule, an
  // explicit zero-length placeholder) until a supervisor edits it.
  const clockIn = scheduledClockIn ?? combineDateAndTime(workDate, "00:00");
  const clockOut = scheduledClockOut ?? combineDateAndTime(workDate, "00:00");
  const decimalHours = calculateDecimalHours(clockIn, clockOut, 0);
  const scheduledHours = scheduledClockIn && scheduledClockOut ? calculateDecimalHours(scheduledClockIn, scheduledClockOut, 0) : null;
  const { regularHours, otHours } = splitRegularAndOvertime(decimalHours, scheduledHours);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const timesheet = await tx.timesheet.upsert({
        where: { employeeId_periodStart_periodEnd: { employeeId, periodStart, periodEnd } },
        update: {},
        create: { employeeId, periodStart, periodEnd },
      });
      if (timesheet.status === "APPROVED") {
        throw new Error("APPROVED_LOCKED");
      }
      const entry = await tx.timesheetEntry.create({
        data: {
          timesheetId: timesheet.id,
          workDate,
          scheduledClockIn,
          scheduledClockOut,
          clockIn,
          clockOut,
          unpaidBreakMins: 0,
          regularHours,
          otHours,
          decimalHours,
          createdById: req.user!.id,
        },
      });
      return { timesheet, entry };
    });

    await recordAudit({
      actorUserId: req.user!.id,
      action: "CREATE",
      entityType: "TIMESHEET_ENTRY",
      entityId: result.entry.id,
      employeeId,
      newValue: result.entry,
    });

    res.status(201).json({ ...serializeEntry(result.entry), hasSchedule: Boolean(schedule) });
  } catch (err) {
    if (err instanceof Error && err.message === "APPROVED_LOCKED") {
      return res.status(409).json({ error: "This pay period's timesheet has already been approved and is locked." });
    }
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      return res.status(409).json({ error: "A timesheet entry already exists for this date." });
    }
    throw err;
  }
}));

const updateEntrySchema = z.object({
  clockInTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional(), // "HH:MM", combined with the entry's workDate
  clockOutTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  unpaidBreakMins: z.number().int().min(0).optional(),
  attendanceAdjustment: z.enum(["NONE", "TARDY", "LEFT_EARLY", "ARRIVED_LATE"]).optional(),
  supplementalType: z.enum(["NONE", "SICK", "PTO", "FCA", "FMLA", "LWOP"]).optional(),
  supplementalHours: z.number().min(0).optional(),
  timeType: z
    .enum([
      "REGULAR_SHIFT",
      "SICK",
      "FCA",
      "FMLA",
      "NO_CALL_NO_SHOW",
      "BEREAVEMENT",
      "LWOP",
      "PTO",
      "PERSONAL_HOLIDAY",
      "HOLIDAY",
      "JURY_DUTY",
      "MATERNITY",
      "PATERNITY",
      "MILITARY",
      "OTHERS",
    ])
    .optional(),
  notes: z.string().optional(),
});

/**
 * Supervisor edit of a single day: actual Clock In/Out, break, attendance
 * adjustment, supplemental time, time type, notes. The Scheduled columns
 * are never touched here - only "Add Day" populates them.
 */
timesheetsRouter.put("/entries/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const entry = await prisma.timesheetEntry.findUnique({
    where: { id },
    include: { timesheet: { include: { employee: true } } },
  });
  if (!entry) return res.status(404).json({ error: "Timesheet entry not found" });
  if (!assertLineOfBusinessAccess(req.user!, entry.timesheet.employee.lineOfBusinessId)) {
    return res.status(403).json({ error: "Not authorized for this line of business" });
  }
  if (entry.timesheet.status === "APPROVED") {
    return res.status(409).json({ error: "This pay period's timesheet has already been approved and is locked." });
  }

  const parsed = updateEntrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const clockIn = data.clockInTime ? combineDateAndTime(entry.workDate, data.clockInTime) : entry.clockIn;
  let clockOut = data.clockOutTime ? combineDateAndTime(entry.workDate, data.clockOutTime) : entry.clockOut;
  if (clockOut.getTime() < clockIn.getTime()) {
    // Actual clock-out crossed midnight relative to the work date (e.g. an overnight shift).
    clockOut = new Date(clockOut.getTime() + 24 * 60 * 60 * 1000);
  }
  const unpaidBreakMins = data.unpaidBreakMins ?? entry.unpaidBreakMins;

  const decimalHours = calculateDecimalHours(clockIn, clockOut, unpaidBreakMins);
  const scheduledHours =
    entry.scheduledClockIn && entry.scheduledClockOut
      ? calculateDecimalHours(entry.scheduledClockIn, entry.scheduledClockOut, 0)
      : null;
  const { regularHours, otHours } = splitRegularAndOvertime(decimalHours, scheduledHours);

  const updated = await prisma.timesheetEntry.update({
    where: { id },
    data: {
      clockIn,
      clockOut,
      unpaidBreakMins,
      regularHours,
      otHours,
      decimalHours,
      attendanceAdjustment: data.attendanceAdjustment ?? entry.attendanceAdjustment,
      supplementalType: data.supplementalType ?? entry.supplementalType,
      supplementalHours: data.supplementalHours ?? Number(entry.supplementalHours),
      timeType: data.timeType ?? entry.timeType,
      notes: data.notes ?? entry.notes,
      updatedById: req.user!.id,
    },
  });

  // Curated audit snapshot - exactly the fields payroll accountability
  // requires: who changed what, from what, to what, and why.
  await recordAudit({
    actorUserId: req.user!.id,
    action: "UPDATE",
    entityType: "TIMESHEET_ENTRY",
    entityId: id,
    employeeId: entry.timesheet.employeeId,
    previousValue: {
      workDate: entry.workDate,
      clockIn: entry.clockIn,
      clockOut: entry.clockOut,
      decimalHours: entry.decimalHours,
      attendanceAdjustment: entry.attendanceAdjustment,
      supplementalType: entry.supplementalType,
      supplementalHours: entry.supplementalHours,
      timeType: entry.timeType,
      notes: entry.notes,
    },
    newValue: {
      workDate: updated.workDate,
      clockIn: updated.clockIn,
      clockOut: updated.clockOut,
      decimalHours: updated.decimalHours,
      attendanceAdjustment: updated.attendanceAdjustment,
      supplementalType: updated.supplementalType,
      supplementalHours: updated.supplementalHours,
      timeType: updated.timeType,
      notes: updated.notes,
    },
  });

  res.json(serializeEntry(updated));
}));

timesheetsRouter.delete("/entries/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const entry = await prisma.timesheetEntry.findUnique({
    where: { id },
    include: { timesheet: { include: { employee: true } } },
  });
  if (!entry) return res.status(404).json({ error: "Timesheet entry not found" });
  if (!assertLineOfBusinessAccess(req.user!, entry.timesheet.employee.lineOfBusinessId)) {
    return res.status(403).json({ error: "Not authorized for this line of business" });
  }
  if (entry.timesheet.status === "APPROVED") {
    return res.status(409).json({ error: "This pay period's timesheet has already been approved and is locked." });
  }

  await prisma.timesheetEntry.delete({ where: { id } });
  await recordAudit({
    actorUserId: req.user!.id,
    action: "DELETE",
    entityType: "TIMESHEET_ENTRY",
    entityId: id,
    employeeId: entry.timesheet.employeeId,
    previousValue: entry,
  });
  res.json({ success: true });
}));

timesheetsRouter.post("/:id/submit", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const timesheet = await prisma.timesheet.findUnique({ where: { id }, include: { employee: true } });
  if (!timesheet) return res.status(404).json({ error: "Timesheet not found" });
  if (!assertLineOfBusinessAccess(req.user!, timesheet.employee.lineOfBusinessId)) {
    return res.status(403).json({ error: "Not authorized" });
  }
  const updated = await prisma.timesheet.update({ where: { id }, data: { status: "SUBMITTED" } });
  await recordAudit({ actorUserId: req.user!.id, action: "UPDATE", entityType: "TIMESHEET", entityId: id, employeeId: timesheet.employeeId, newValue: updated });
  res.json(updated);
}));

timesheetsRouter.post("/:id/approve", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const timesheet = await prisma.timesheet.findUnique({ where: { id }, include: { employee: true } });
  if (!timesheet) return res.status(404).json({ error: "Timesheet not found" });
  if (!assertLineOfBusinessAccess(req.user!, timesheet.employee.lineOfBusinessId)) {
    return res.status(403).json({ error: "Not authorized" });
  }
  const updated = await prisma.timesheet.update({
    where: { id },
    data: { status: "APPROVED", approvedById: req.user!.id, approvedAt: new Date() },
  });
  await recordAudit({ actorUserId: req.user!.id, action: "APPROVE", entityType: "TIMESHEET", entityId: id, employeeId: timesheet.employeeId, newValue: updated });
  res.json(updated);
}));

timesheetsRouter.post("/:id/reject", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const timesheet = await prisma.timesheet.findUnique({ where: { id }, include: { employee: true } });
  if (!timesheet) return res.status(404).json({ error: "Timesheet not found" });
  if (!assertLineOfBusinessAccess(req.user!, timesheet.employee.lineOfBusinessId)) {
    return res.status(403).json({ error: "Not authorized" });
  }
  const updated = await prisma.timesheet.update({ where: { id }, data: { status: "REJECTED" } });
  await recordAudit({ actorUserId: req.user!.id, action: "REJECT", entityType: "TIMESHEET", entityId: id, employeeId: timesheet.employeeId, newValue: updated });
  res.json(updated);
}));
