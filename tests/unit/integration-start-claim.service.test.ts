import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimIntegrationStart } from "@/server/services/integration-start-claim.service";

const create = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { auditLog: { create } } }));
const requestId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => { create.mockReset(); });

describe("explicit integration start replay claims", () => {
  it("atomically admits one concurrent request and persists no raw request ID or credentials", async () => {
    const ids = new Set<string>();
    create.mockImplementation(async ({ data }) => {
      if (ids.has(data.id)) throw new Prisma.PrismaClientKnownRequestError("Duplicate", { code: "P2002", clientVersion: "unit-test" });
      ids.add(data.id);
    });
    const results = await Promise.all([
      claimIntegrationStart("therapist-id", "google-connect", requestId),
      claimIntegrationStart("therapist-id", "google-connect", requestId),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(ids.size).toBe(1);
    expect(JSON.stringify(create.mock.calls)).not.toContain(requestId);
    expect(create).toHaveBeenCalledWith({ data: {
      id: expect.stringMatching(/^integration-start:[a-f0-9]{64}$/), actorUserId: "therapist-id",
      entityType: "IntegrationStart", entityId: "therapist-id", action: "INTEGRATION_START_CLAIMED",
      after: { intent: "google-connect" },
    } });
  });
  it("keeps user and provider replay scopes independent", async () => {
    await claimIntegrationStart("user-a", "google-connect", requestId);
    await claimIntegrationStart("user-b", "google-connect", requestId);
    await claimIntegrationStart("user-a", "stripe-connect", requestId);
    expect(new Set(create.mock.calls.map(([input]) => input.data.id)).size).toBe(3);
  });
  it("fails closed on storage errors without leaking them", async () => {
    create.mockRejectedValue(new Error("private-database-connection-details"));
    await expect(claimIntegrationStart("user-a", "google-connect", requestId)).rejects.toThrow("Integration start could not be recorded");
    await expect(claimIntegrationStart("user-a", "google-connect", requestId)).rejects.not.toThrow("private-database");
  });
});
