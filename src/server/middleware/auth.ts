import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { verifyJwt } from "../utils/auth";

export interface AuthenticatedUser {
  id: number;
  userId: string;
  role: "ADMINISTRATOR" | "SUPERVISOR";
  isAdministrator: boolean;
  canViewAllLinesOfBiz: boolean;
  lineOfBusinessIds: number[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  try {
    const payload = verifyJwt(header.slice("Bearer ".length));
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { lineOfBusinessAccess: true },
    });
    if (!dbUser || !dbUser.isActive) {
      return res.status(401).json({ error: "Account not found or inactive" });
    }
    req.user = {
      id: dbUser.id,
      userId: dbUser.userId,
      role: dbUser.role,
      isAdministrator: dbUser.isAdministrator,
      canViewAllLinesOfBiz: dbUser.canViewAllLinesOfBiz,
      lineOfBusinessIds: dbUser.lineOfBusinessAccess.map((a) => a.lineOfBusinessId),
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAdministrator(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isAdministrator) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }
  next();
}

/** Ensures the authenticated user may access the given line-of-business id. */
export function assertLineOfBusinessAccess(user: AuthenticatedUser, lineOfBusinessId: number): boolean {
  if (user.canViewAllLinesOfBiz || user.isAdministrator) return true;
  return user.lineOfBusinessIds.includes(lineOfBusinessId);
}

export function requireLineOfBusinessAccess(getLobId: (req: Request) => number | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    const lobId = getLobId(req);
    if (lobId === undefined) return next();
    if (!req.user || !assertLineOfBusinessAccess(req.user, lobId)) {
      return res.status(403).json({ error: "Not authorized for this line of business" });
    }
    next();
  };
}
