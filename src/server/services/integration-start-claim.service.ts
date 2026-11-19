import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function claimIntegrationStart(
  userId: string,
  intent: "google-connect" | "stripe-connect",
  requestId: string,
) {
  const digest = createHash("sha256").update(JSON.stringify([userId, intent, requestId])).digest("hex");
  // The existing primary key is an atomic replay claim across server instances.
  // No OAuth state, session cookie, request nonce or provider token is stored.
  try {
    await prisma.auditLog.create({ data: {
      id: `integration-start:${digest}`, actorUserId: userId,
      entityType: "IntegrationStart", entityId: userId,
      action: "INTEGRATION_START_CLAIMED", after: { intent },
    } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw new Error("Integration start could not be recorded. Please reload settings and try again.");
  }
}
