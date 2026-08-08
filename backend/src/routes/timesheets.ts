import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { assertLineOfBusinessAccess, requireAuth } from "../middleware/auth";
import { recordAudit } from "../services/audit";
import { calculateDecimalHours, sumDecimalHours } from "../utils/time";

export const timesheetsRouter = Router();
timesheetsRouter.use(requireAuth);

async function assertEmployeeAccess(req: import("express").Request, employeeId: number) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return null;
  if (!assertLineOfBusinessAccess(req.user!, employee.lineOfBusinessId)) return null;
  return employee;
}

// Get or create the timesheet for an employee's pay period, with entries + totals.
timesheetsRouter.get("/employee/:employeeId", async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const employee = await assertEmployeeAccess(req, employeeId);
  if (!employee) return res.status(403).json({ error: "Not authorized or employee not found" });

  const periodStart = new Date(String(req.query.periodStart));
  const periodEnd = new Date(String(req.query.periodEnd));
  if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
    return res.status(400).json({ error: "periodStart and periodEnd query params are required" });
  }

  const timesheet = await prisma.timesheet.findUnique({
    where: { employeeId_periodStart_periodEnd: { employeeId, periodStart, periodEnd } },
    include: { entries: { orderBy: { workDate: "asc" } } },
  });

  if (!timesheet) {
    return res.json({ employeeId, periodStart, periodEnd, status: "OPEN", entries: [], totalHours: 0 });
  }

  const totalHours = sumDecimalHours(timesheet.entries.map((e) => Number(e.decimalHours)));
  res.json({ ...timesheet, totalHours });
});

const entrySchema = z.object({
  workDate: z.coerce.date(),
  clockIn: z.coerce.date(),
  clockOut: z.coerce.date(),
  unpaidBreakMins: z.number().int().min(0).default(0),
  notes: z.string().optional(),
});

const upsertTimesheetSchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  entries: z.array(entrySchema),
});

// Replace all entries for a period in one call (typical "fill out the biweekly sheet" flow).
// Each entry's decimal hours is computed server-side from actual clock times, never from
// caller-supplied totals, so the persisted value always matches the recorded times.
timesheetsRouter.put("/employee/:employeeId", async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const employee = await assertEmployeeAccess(req, employeeId);
  if (!employee) return res.status(403).json({ error: "Not authorized or employee not found" });

  const parsed = upsertTimesheetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { periodStart, periodEnd, entries } = parsed.data;

  const computedEntries = entries.map((e) => ({
    workDate: e.workDate,
    clockIn: e.clockIn,
    clockOut: e.clockOut,
    unpaidBreakMins: e.unpaidBreakMins,
    notes: e.notes,
    decimalHours: calculateDecimalHours(e.clockIn, e.clockOut, e.unpaidBreakMins),
  }));

  const timesheet = await prisma.$transaction(async (tx) => {
    const existing = await tx.timesheet.findUnique({
      where: { employeeId_periodStart_periodEnd: { employeeId, periodStart, periodEnd } },
    });
    if (existing && existing.status === "APPROVED") {
      throw new Error("APPROVED_LOCKED");
    }
    const ts = existing
      ? existing
      : await tx.timesheet.create({ data: { employeeId, periodStart, periodEnd, status: "OPEN" } });

    await tx.timesheetEntry.deleteMany({ where: { timesheetId: ts.id } });
    await tx.timesheetEntry.createMany({
      data: computedEntries.map((e) => ({ ...e, timesheetId: ts.id })),
    });
    return tx.timesheet.findUniqueOrThrow({ where: { id: ts.id }, include: { entries: true } });
  }).catch((err) => {
    if (err instanceof Error && err.message === "APPROVED_LOCKED") return null;
    throw err;
  });

  if (!timesheet) {
    return res.status(409).json({ error: "This timesheet has already been approved and is locked. Contact an administrator to reopen it." });
  }

  await recordAudit({
    actorUserId: req.user!.id,
    action: "UPDATE",
    entityType: "TIMESHEET",
    entityId: timesheet.id,
    employeeId,
    newValue: timesheet,
  });

  const totalHours = sumDecimalHours(timesheet.entries.map((e) => Number(e.decimalHours)));
  res.json({ ...timesheet, totalHours });
});

timesheetsRouter.post("/:id/submit", async (req, res) => {
  const id = Number(req.params.id);
  const timesheet = await prisma.timesheet.findUnique({ where: { id }, include: { employee: true } });
  if (!timesheet) return res.status(404).json({ error: "Timesheet not found" });
  if (!assertLineOfBusinessAccess(req.user!, timesheet.employee.lineOfBusinessId)) {
    return res.status(403).json({ error: "Not authorized" });
  }
  const updated = await prisma.timesheet.update({ where: { id }, data: { status: "SUBMITTED" } });
  await recordAudit({ actorUserId: req.user!.id, action: "UPDATE", entityType: "TIMESHEET", entityId: id, employeeId: timesheet.employeeId, newValue: updated });
  res.json(updated);
});

timesheetsRouter.post("/:id/approve", async (req, res) => {
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
});

timesheetsRouter.post("/:id/reject", async (req, res) => {
  const id = Number(req.params.id);
  const timesheet = await prisma.timesheet.findUnique({ where: { id }, include: { employee: true } });
  if (!timesheet) return res.status(404).json({ error: "Timesheet not found" });
  if (!assertLineOfBusinessAccess(req.user!, timesheet.employee.lineOfBusinessId)) {
    return res.status(403).json({ error: "Not authorized" });
  }
  const updated = await prisma.timesheet.update({ where: { id }, data: { status: "REJECTED" } });
  await recordAudit({ actorUserId: req.user!.id, action: "REJECT", entityType: "TIMESHEET", entityId: id, employeeId: timesheet.employeeId, newValue: updated });
  res.json(updated);
});
