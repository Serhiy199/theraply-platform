import { beforeEach, describe, expect, it, vi } from "vitest";
import { TherapistApprovalStatus, UserRole } from "@prisma/client";
import { updateTherapistPublicProfile } from "@/server/services/therapist-public-profile.service";
import { updatePublicProfileAction } from "@/app/therapist/dashboard/actions";
import { evaluateTherapistReadiness } from "@/lib/therapist-readiness";

const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), audit: vi.fn(), transaction: vi.fn(), user: vi.fn(), guard: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/permissions", () => ({ requireActionActiveTherapistFeatures: mocks.guard }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
const input = { bio: "My professional biography", specialization: "Anxiety", therapyServicesProvided: "Individual therapy", yearsOfExperience: "8" };
const approved = {
  id: "own-profile", userId: "own-user", ...input, bio: "", approvalStatus: TherapistApprovalStatus.APPROVED,
  isApproved: true, onboardingCompleted: true, sessionPricePence: 6000,
  isGoogleCalendarConnected: false, googleCalendarId: null, googleRefreshToken: null,
  stripeAccountId: null, stripePayoutsEnabled: false, stripeDetailsSubmitted: false,
  displayName: "Therapist", profilePhotoUrl: "https://example.test/photo.jpg",
};
const user = { role: UserRole.THERAPIST, isActive: true, emailVerified: true };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockResolvedValue(approved);
  mocks.update.mockResolvedValue({ count: 1 });
  mocks.audit.mockResolvedValue({});
  mocks.user.mockResolvedValue({ id: "own-user", ...user });
  mocks.guard.mockResolvedValue({ id: "own-user", ...user });
  mocks.transaction.mockImplementation(fn => fn({ therapistProfile: { findFirst: mocks.find, updateMany: mocks.update }, auditLog: { create: mocks.audit } }));
});

describe("approved public profile editing", () => {
  it("updates only own allowlisted fields under fresh active/role/approval guards", async () => {
    await updateTherapistPublicProfile("own-user", input);
    expect(mocks.update).toHaveBeenCalledWith({ where: {
      id: "own-profile", userId: "own-user", approvalStatus: "APPROVED", isApproved: true,
      user: { is: { id: "own-user", ...user } },
    }, data: input });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: "own-user", entityId: "own-profile", action: "THERAPIST_PUBLIC_PROFILE_UPDATED" }) });
    const result = { ...approved, ...mocks.update.mock.calls[0][0].data };
    expect(result.approvalStatus).toBe("APPROVED");
    expect(result.isApproved).toBe(true);
    expect(result.isGoogleCalendarConnected).toBe(false);
    expect(result.stripeAccountId).toBeNull();
  });
  it.each(["userId", "id", "therapistProfileId", "approvalStatus", "isApproved", "role", "publicReady", "onboardingCompleted", "googleRefreshToken", "stripePayoutsEnabled", "sessionPricePence", "profilePhotoUrl"])("rejects protected/unowned field %s", async field => {
    await expect(updateTherapistPublicProfile("own-user", { ...input, [field]: "other" })).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("denies missing or freshly ineligible owner and stale update", async () => {
    mocks.find.mockResolvedValueOnce(null);
    await expect(updateTherapistPublicProfile("own-user", input)).rejects.toThrow("access denied");
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.update.mockResolvedValueOnce({ count: 0 });
    await expect(updateTherapistPublicProfile("own-user", input)).rejects.toThrow("access denied");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("fails the transaction when auditing fails", async () => {
    mocks.audit.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(updateTherapistPublicProfile("own-user", input)).rejects.toThrow("audit unavailable");
  });
  it("removes only public completeness blocker, leaving integration blockers", async () => {
    const before = evaluateTherapistReadiness({ user, profile: approved });
    const changed = await updateTherapistPublicProfile("own-user", input);
    const after = evaluateTherapistReadiness({ user, profile: { ...approved, ...changed } });
    expect(before.reasons).toContain("PUBLIC_PROFILE_INCOMPLETE");
    expect(after.reasons).not.toContain("PUBLIC_PROFILE_INCOMPLETE");
    expect(after.reasons).toEqual(before.reasons.filter(reason => reason !== "PUBLIC_PROFILE_INCOMPLETE"));
    expect(after.publicReady).toBe(false);
    expect(evaluateTherapistReadiness({ user, profile: { ...approved, ...changed, profilePhotoUrl: null } }).reasons).toContain("PUBLIC_PROFILE_INCOMPLETE");
  });
  it("action derives identity from auth and rejects injected owner IDs", async () => {
    const form = new FormData();
    Object.entries(input).forEach(([key, value]) => form.set(key, value));
    expect((await updatePublicProfileAction({ status: "idle" }, form)).status).toBe("success");
    expect(mocks.guard).toHaveBeenCalledWith({ id: "own-user", ...user });
    expect(mocks.find.mock.calls[0][0].where.userId).toBe("own-user");
    mocks.update.mockClear();
    form.set("userId", "victim");
    expect((await updatePublicProfileAction({ status: "idle" }, form)).status).toBe("error");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("action blocks unauthenticated or unauthorized callers", async () => {
    mocks.guard.mockRejectedValue(new Error("denied"));
    expect((await updatePublicProfileAction({ status: "idle" }, new FormData())).status).toBe("error");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["", "-1", "1.5", "81", "NaN"])("rejects invalid experience %s", async yearsOfExperience => {
    await expect(updateTherapistPublicProfile("own-user", { ...input, yearsOfExperience })).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
