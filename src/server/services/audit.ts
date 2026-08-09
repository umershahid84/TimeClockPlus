import { AuditAction, AuditEntityType } from "@prisma/client";
import { prisma } from "../config/prisma";

export async function recordAudit(params: {
  actorUserId: number | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: number;
  employeeId?: number | null;
  previousValue?: unknown;
  newValue?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      actorUserId: params.actorUserId ?? undefined,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      employeeId: params.employeeId ?? undefined,
      previousValue: params.previousValue !== undefined ? JSON.stringify(params.previousValue) : undefined,
      newValue: params.newValue !== undefined ? JSON.stringify(params.newValue) : undefined,
    },
  });
}
