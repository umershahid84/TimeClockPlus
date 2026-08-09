import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { assertLineOfBusinessAccess, requireAdministrator, requireAuth } from "../middleware/auth";
import { recordAudit } from "../services/audit";

export const schedulesRouter = Router();
schedulesRouter.use(requireAuth);

/**
 * Resolve the schedule row that was in effect for a given employee on a
 * given date: the most recent schedule whose effectiveDate <= date AND
 * (endDate is null OR endDate > date).
 */
export async function resolveScheduleForDate(employeeId: number, date: Date) {
  return prisma.employeeSchedule.findFirst({
    where: {
      employeeId,
      effectiveDate: { lte: date },
      OR: [{ endDate: null }, { endDate: { gt: date } }],
    },
    orderBy: { effectiveDate: "desc" },
  });
}

// Full schedule history for an employee.
schedulesRouter.get("/employee/:employeeId", async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });
  if (!assertLineOfBusinessAccess(req.user!, employee.lineOfBusinessId)) {
    return res.status(403).json({ error: "Not authorized for this line of business" });
  }
  const schedules = await prisma.employeeSchedule.findMany({
    where: { employeeId },
    orderBy: { effectiveDate: "desc" },
  });
  res.json(schedules);
});

// The schedule in effect on a specific date (defaults to today).
schedulesRouter.get("/employee/:employeeId/at", async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });
  if (!assertLineOfBusinessAccess(req.user!, employee.lineOfBusinessId)) {
    return res.status(403).json({ error: "Not authorized for this line of business" });
  }
  const date = req.query.date ? new Date(String(req.query.date)) : new Date();
  const schedule = await resolveScheduleForDate(employeeId, date);
  res.json(schedule);
});

// List current schedules across a line of business (for the schedule board / print view).
schedulesRouter.get("/lineOfBusiness/:lineOfBusinessId", async (req, res) => {
  const lineOfBusinessId = Number(req.params.lineOfBusinessId);
  if (!assertLineOfBusinessAccess(req.user!, lineOfBusinessId)) {
    return res.status(403).json({ error: "Not authorized for this line of business" });
  }
  const date = req.query.date ? new Date(String(req.query.date)) : new Date();
  const employees = await prisma.employee.findMany({
    where: { lineOfBusinessId, status: "ACTIVE" },
    orderBy: [{ lastName: "asc" }],
  });
  const results = await Promise.all(
    employees.map(async (employee) => ({
      employee,
      schedule: await resolveScheduleForDate(employee.id, date),
    }))
  );
  res.json(results);
});

const newScheduleSchema = z.object({
  employmentStatus: z.enum(["FULL_TIME", "PART_TIME"]),
  shiftStartTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  shiftEndTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  daysOff: z.string().min(1),
  effectiveDate: z.coerce.date(),
  notes: z.string().optional(),
});

// Create a NEW effective-dated schedule row. This never edits or deletes
// prior rows — it closes out the previously-open row (sets endDate) and
// inserts a new one, preserving full history per the historical-data
// requirement. Modifying an employee's schedule is master-data
// maintenance, so only administrators may do it - supervisors can view
// schedules but not change them.
schedulesRouter.post("/employee/:employeeId", requireAdministrator, async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });
  if (!assertLineOfBusinessAccess(req.user!, employee.lineOfBusinessId)) {
    return res.status(403).json({ error: "Not authorized for this line of business" });
  }
  const parsed = newScheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    // Close out any schedule rows that overlap the new effective date.
    await tx.employeeSchedule.updateMany({
      where: {
        employeeId,
        effectiveDate: { lt: data.effectiveDate },
        OR: [{ endDate: null }, { endDate: { gt: data.effectiveDate } }],
      },
      data: { endDate: data.effectiveDate },
    });

    return tx.employeeSchedule.create({
      data: {
        employeeId,
        employmentStatus: data.employmentStatus,
        shiftStartTime: data.shiftStartTime,
        shiftEndTime: data.shiftEndTime,
        daysOff: data.daysOff,
        effectiveDate: data.effectiveDate,
        notes: data.notes,
        createdById: req.user!.id,
      },
    });
  });

  await recordAudit({
    actorUserId: req.user!.id,
    action: "CREATE",
    entityType: "SCHEDULE",
    entityId: result.id,
    employeeId,
    newValue: result,
  });

  res.status(201).json(result);
});
