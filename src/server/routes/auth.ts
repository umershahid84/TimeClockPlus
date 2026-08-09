import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import {
  generateOtc,
  hashOtc,
  hashPassword,
  signJwt,
  verifyPassword,
} from "../utils/auth";
import { sendForgotUsernameEmail, sendPasswordResetCodeEmail } from "../services/email";
import { recordAudit } from "../services/audit";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const forgotLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

const loginSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "userId and password are required" });
  const { userId, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { userId } });
  if (!user || !user.isActive) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return res.status(423).json({ error: "Account temporarily locked due to failed login attempts. Try again later." });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= env.maxFailedLoginAttempts;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + env.accountLockoutMinutes * 60 * 1000) : undefined,
      },
    });
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < new Date() && user.mustChangePassword) {
    return res.status(401).json({ error: "Temporary password expired. Use Forgot Password to reset it." });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await recordAudit({ actorUserId: user.id, action: "LOGIN", entityType: "USER", entityId: user.id });

  const token = signJwt({ userId: user.id, role: user.role, isAdministrator: user.isAdministrator });
  return res.json({
    token,
    mustChangePassword: user.mustChangePassword,
    user: {
      id: user.id,
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isAdministrator: user.isAdministrator,
      canViewAllLinesOfBiz: user.canViewAllLinesOfBiz,
    },
  });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10),
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false, tempPasswordExpiresAt: null },
  });
  await recordAudit({ actorUserId: user.id, action: "PASSWORD_RESET", entityType: "USER", entityId: user.id });
  res.json({ success: true });
});

// --- Forgot password (email/userId -> OTC -> new password) ---

const forgotPasswordRequestSchema = z.object({ identifier: z.string().min(1) });

authRouter.post("/forgot-password/request", forgotLimiter, async (req, res) => {
  const parsed = forgotPasswordRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const { identifier } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { userId: identifier }] },
  });

  // Always return the same generic response so we don't reveal account existence.
  if (user) {
    const code = generateOtc();
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        codeHash: hashOtc(code),
        expiresAt: new Date(Date.now() + env.passwordResetCodeExpiryMinutes * 60 * 1000),
      },
    });
    await sendPasswordResetCodeEmail({ to: user.email, code });
  }

  res.json({ message: "If an account exists, a one-time code has been sent to the registered email address." });
});

const forgotPasswordConfirmSchema = z.object({
  identifier: z.string().min(1),
  code: z.string().length(6),
  newPassword: z.string().min(10),
});

authRouter.post("/forgot-password/confirm", forgotLimiter, async (req, res) => {
  const parsed = forgotPasswordConfirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const { identifier, code, newPassword } = parsed.data;

  const user = await prisma.user.findFirst({ where: { OR: [{ email: identifier }, { userId: identifier }] } });
  if (!user) return res.status(400).json({ error: "Invalid or expired code" });

  const reset = await prisma.passwordReset.findFirst({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() }, codeHash: hashOtc(code) },
    orderBy: { createdAt: "desc" },
  });
  if (!reset) return res.status(400).json({ error: "Invalid or expired code" });

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        tempPasswordExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    }),
    prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
  ]);
  await recordAudit({ actorUserId: user.id, action: "PASSWORD_RESET", entityType: "USER", entityId: user.id });

  res.json({ success: true });
});

// --- Forgot username ---

const forgotUsernameSchema = z.object({ email: z.string().email() });

authRouter.post("/forgot-username", forgotLimiter, async (req, res) => {
  const parsed = forgotUsernameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user) {
    await sendForgotUsernameEmail({ to: user.email, userId: user.userId });
  }
  res.json({ message: "If an account exists with that email, the User ID has been sent to it." });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    include: { lineOfBusinessAccess: { include: { lineOfBusiness: true } } },
  });
  res.json({
    id: user.id,
    userId: user.userId,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    isAdministrator: user.isAdministrator,
    canViewAllLinesOfBiz: user.canViewAllLinesOfBiz,
    linesOfBusiness: user.lineOfBusinessAccess.map((a) => ({
      id: a.lineOfBusiness.id,
      code: a.lineOfBusiness.code,
      name: a.lineOfBusiness.name,
    })),
  });
});
