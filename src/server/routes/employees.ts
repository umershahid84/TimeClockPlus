import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { assertLineOfBusinessAccess, requireAdministrator, requireAuth } from "../middleware/auth";
import { recordAudit } from "../services/audit";

export const employeesRouter = Router();
employeesRouter.use(requireAuth);

function visibleLineOfBusinessFilter(user: NonNullable<Express.Request["user"]>) {
  if (user.isAdministrator || user.canViewAllLinesOfBiz) return {};
  return { lineOfBusinessId: { in: user.lineOfBusinessIds } };
}

employeesRouter.get("/", async (req, res) => {
  const status = (req.query.status as string) ?? "ACTIVE";
  const lineOfBusinessId = req.query.lineOfBusinessId ? Number(req.query.lineOfBusinessId) : undefined;

  if (lineOfBusinessId !== undefined && !assertLineOfBusinessAccess(req.user!, lineOfBusinessId)) {
    return res.status(403).json({ error: "Not authorized for this line of business" });
  }

  const employees = await prisma.employee.findMany({
    where: {
      ...visibleLineOfBusinessFilter(req.user!),
      ...(lineOfBusinessId ? { lineOfBusinessId } : {}),
      ...(status !== "ALL" ? { status: status as never } : {}),
    },
    include: { lineOfBusiness: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  res.json(employees);
});

employeesRouter.get("/:id", async (req, res) => {
  const employee = await prisma.employee.findUnique({
    where: { id: Number(req.params.id) },
    include: { lineOfBusiness: true, schedules: { orderBy: { effectiveDate: "desc" } } },
  });
  if (!employee) return res.status(404).json({ error: "Employee not found" });
  if (!assertLineOfBusinessAccess(req.user!, employee.lineOfBusinessId)) {
    return res.status(403).json({ error: "Not authorized for this line of business" });
  }
  res.json(employee);
});

const createEmployeeSchema = z.object({
  employeeCode: z.string().min(1),
  dateOfHire: z.coerce.date(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phoneNumber: z.string().min(1),
  lineOfBusinessId: z.number().int(),
  employmentStatus: z.enum(["FULL_TIME", "PART_TIME"]),
  shiftStartTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  shiftEndTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  daysOff: z.string().min(1),
  effectiveDate: z.coerce.date(),
});

// Adding, editing, archiving, and removing employees - and modifying their
// schedules or other master information - is an administrator-only action.
// Supervisors may view employees, schedules, and timesheets for their
// assigned line(s) of business, and record actual time worked, but they
// cannot touch the employee/schedule master records themselves.
employeesRouter.post("/", requireAdministrator, async (req, res) => {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const employee = await prisma.employee.create({
    data: {
      employeeCode: data.employeeCode,
      dateOfHire: data.dateOfHire,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber,
      lineOfBusinessId: data.lineOfBusinessId,
      createdById: req.user!.id,
      schedules: {
        create: {
          employmentStatus: data.employmentStatus,
          shiftStartTime: data.shiftStartTime,
          shiftEndTime: data.shiftEndTime,
          daysOff: data.daysOff,
          effectiveDate: data.effectiveDate,
          createdById: req.user!.id,
        },
      },
    },
    include: { schedules: true },
  });

  await recordAudit({
    actorUserId: req.user!.id,
    action: "CREATE",
    entityType: "EMPLOYEE",
    entityId: employee.id,
    employeeId: employee.id,
    newValue: employee,
  });

  res.status(201).json(employee);
});

const updateEmployeeSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phoneNumber: z.string().min(1).optional(),
});

employeesRouter.put("/:id", requireAdministrator, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Employee not found" });
  const parsed = updateEmployeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await prisma.employee.update({ where: { id }, data: parsed.data });
  await recordAudit({
    actorUserId: req.user!.id,
    action: "UPDATE",
    entityType: "EMPLOYEE",
    entityId: id,
    employeeId: id,
    previousValue: existing,
    newValue: updated,
  });
  res.json(updated);
});

employeesRouter.post("/:id/archive", requireAdministrator, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Employee not found" });
  const updated = await prisma.employee.update({
    where: { id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
  await recordAudit({
    actorUserId: req.user!.id,
    action: "ARCHIVE",
    entityType: "EMPLOYEE",
    entityId: id,
    employeeId: id,
    previousValue: existing,
    newValue: updated,
  });
  res.json(updated);
});

employeesRouter.delete("/:id", requireAdministrator, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Employee not found" });
  const updated = await prisma.employee.update({ where: { id }, data: { status: "REMOVED" } });
  await recordAudit({
    actorUserId: req.user!.id,
    action: "DELETE",
    entityType: "EMPLOYEE",
    entityId: id,
    employeeId: id,
    previousValue: existing,
    newValue: updated,
  });
  res.json({ success: true });
});
