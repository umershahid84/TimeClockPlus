import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { requireAdministrator, requireAuth } from "../middleware/auth";
import { generateTempPassword, hashPassword } from "../utils/auth";
import { sendSupervisorWelcomeEmail } from "../services/email";
import { recordAudit } from "../services/audit";

export const usersRouter = Router();
usersRouter.use(requireAuth, requireAdministrator);

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    include: { lineOfBusinessAccess: { include: { lineOfBusiness: true } } },
    orderBy: [{ lastName: "asc" }],
  });
  res.json(
    users.map((u) => ({
      id: u.id,
      userId: u.userId,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      isAdministrator: u.isAdministrator,
      canViewAllLinesOfBiz: u.canViewAllLinesOfBiz,
      isActive: u.isActive,
      linesOfBusiness: u.lineOfBusinessAccess.map((a) => ({
        id: a.lineOfBusiness.id,
        code: a.lineOfBusiness.code,
        name: a.lineOfBusiness.name,
      })),
    }))
  );
});

const createSupervisorSchema = z.object({
  userId: z.string().min(3),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  lineOfBusinessIds: z.array(z.number().int()).min(1),
  grantAdministrator: z.boolean().default(false),
});

// Administrator creates a Supervisor account: generates a temp password,
// emails the User ID / temp password / login link, and forces a password
// change on first login.
usersRouter.post("/supervisors", async (req, res) => {
  const parsed = createSupervisorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const user = await prisma.user.create({
    data: {
      userId: data.userId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      passwordHash,
      role: "SUPERVISOR",
      isAdministrator: data.grantAdministrator,
      mustChangePassword: true,
      tempPasswordExpiresAt: new Date(Date.now() + env.tempPasswordExpiryHours * 60 * 60 * 1000),
      lineOfBusinessAccess: {
        create: data.lineOfBusinessIds.map((lineOfBusinessId) => ({ lineOfBusinessId })),
      },
    },
    include: { lineOfBusinessAccess: true },
  });

  await sendSupervisorWelcomeEmail({ to: user.email, userId: user.userId, tempPassword });
  await recordAudit({
    actorUserId: req.user!.id,
    action: "CREATE",
    entityType: "USER",
    entityId: user.id,
    newValue: { userId: user.userId, email: user.email, role: user.role },
  });

  res.status(201).json({ id: user.id, userId: user.userId, email: user.email });
});

// Grant/revoke Administrator privileges on an existing Supervisor.
// Existing supervisory line-of-business access is left untouched.
usersRouter.post("/:id/administrator", async (req, res) => {
  const id = Number(req.params.id);
  const grant = Boolean(req.body?.grant);
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "User not found" });

  const updated = await prisma.user.update({ where: { id }, data: { isAdministrator: grant } });
  await recordAudit({
    actorUserId: req.user!.id,
    action: "PERMISSION_CHANGE",
    entityType: "USER",
    entityId: id,
    previousValue: { isAdministrator: existing.isAdministrator },
    newValue: { isAdministrator: updated.isAdministrator },
  });
  res.json(updated);
});

const updateAccessSchema = z.object({
  lineOfBusinessIds: z.array(z.number().int()),
  canViewAllLinesOfBiz: z.boolean().optional(),
});

usersRouter.put("/:id/access", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateAccessSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existing = await prisma.user.findUnique({ where: { id }, include: { lineOfBusinessAccess: true } });
  if (!existing) return res.status(404).json({ error: "User not found" });

  await prisma.$transaction([
    prisma.userLineOfBusiness.deleteMany({ where: { userId: id } }),
    prisma.userLineOfBusiness.createMany({
      data: parsed.data.lineOfBusinessIds.map((lineOfBusinessId) => ({ userId: id, lineOfBusinessId })),
    }),
    ...(parsed.data.canViewAllLinesOfBiz !== undefined
      ? [prisma.user.update({ where: { id }, data: { canViewAllLinesOfBiz: parsed.data.canViewAllLinesOfBiz } })]
      : []),
  ]);

  await recordAudit({
    actorUserId: req.user!.id,
    action: "PERMISSION_CHANGE",
    entityType: "USER",
    entityId: id,
    previousValue: existing.lineOfBusinessAccess,
    newValue: parsed.data,
  });

  res.json({ success: true });
});

usersRouter.post("/:id/deactivate", async (req, res) => {
  const id = Number(req.params.id);
  const updated = await prisma.user.update({ where: { id }, data: { isActive: false } });
  await recordAudit({ actorUserId: req.user!.id, action: "UPDATE", entityType: "USER", entityId: id, newValue: { isActive: false } });
  res.json(updated);
});
