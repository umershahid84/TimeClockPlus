import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdministrator, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

/**
 * Read-only history of sensitive actions across the system - employee/
 * schedule/timesheet changes, permission changes, password resets,
 * logins, kiosk punches, etc. (see services/audit.ts, called from every
 * route that mutates something sensitive). Administrator-only, since it
 * can reveal who changed what for anyone in the organization.
 */
export const auditLogRouter = Router();
auditLogRouter.use(requireAuth, requireAdministrator);

const querySchema = z.object({
  entityType: z.string().optional(),
  action: z.string().optional(),
  actorUserId: z.coerce.number().int().optional(),
  employeeId: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

auditLogRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { entityType, action, actorUserId, employeeId, limit, offset } = parsed.data;

  const where = {
    ...(entityType ? { entityType: entityType as never } : {}),
    ...(action ? { action: action as never } : {}),
    ...(actorUserId !== undefined ? { actorUserId } : {}),
    ...(employeeId !== undefined ? { employeeId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        actor: { select: { id: true, userId: true, firstName: true, lastName: true } },
        employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ items, total, limit, offset });
}));
