import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  captureDiagnosticEvent,
  type DiagnosticMetadata,
} from "@/server/services/monitoring.service";

export type AuditLogInput = {
  actorUserId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
};

function toNullableJson(value: unknown) {
  return value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export async function createAuditLogEntry(input: AuditLogInput) {
  return prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      before: toNullableJson(input.before),
      after: toNullableJson(input.after),
    },
  });
}

export async function createAuditLogEntryBestEffort(input: AuditLogInput) {
  try {
    await createAuditLogEntry(input);
  } catch (error) {
    logDiagnosticEvent("audit-log", "Failed to persist audit entry.", {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      error,
    });
  }
}

export function logDiagnosticEvent(
  scope: string,
  message: string,
  metadata?: DiagnosticMetadata,
) {
  captureDiagnosticEvent({
    scope,
    message,
    metadata,
  });
}
