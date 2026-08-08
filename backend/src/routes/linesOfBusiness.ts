import { Router } from "express";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";

export const linesOfBusinessRouter = Router();
linesOfBusinessRouter.use(requireAuth);

linesOfBusinessRouter.get("/", async (req, res) => {
  const all = await prisma.lineOfBusiness.findMany({ orderBy: { id: "asc" } });
  if (req.user!.isAdministrator || req.user!.canViewAllLinesOfBiz) {
    return res.json(all);
  }
  res.json(all.filter((lob) => req.user!.lineOfBusinessIds.includes(lob.id)));
});
