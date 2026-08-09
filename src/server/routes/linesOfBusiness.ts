import { Router } from "express";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const linesOfBusinessRouter = Router();
linesOfBusinessRouter.use(requireAuth);

linesOfBusinessRouter.get("/", asyncHandler(async (req, res) => {
  const all = await prisma.lineOfBusiness.findMany({ orderBy: { id: "asc" } });
  if (req.user!.isAdministrator || req.user!.canViewAllLinesOfBiz) {
    return res.json(all);
  }
  res.json(all.filter((lob) => req.user!.lineOfBusinessIds.includes(lob.id)));
}));
