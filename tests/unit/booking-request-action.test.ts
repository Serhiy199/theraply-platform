import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBookingRequestAction } from "@/app/client/book/actions";
import { ActionPermissionError } from "@/lib/permissions";
import { BookingFlowServiceError } from "@/server/services/booking-flow.service";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), create: vi.fn(), revalidate: vi.fn(), redirect: vi.fn(), diagnostic: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/permissions", () => ({
  requireActionRole: mocks.authorize,
  ActionPermissionError: class extends Error {},
}));
vi.mock("@/server/services/booking-flow.service", () => ({
  createBookingRequest: mocks.create,
  BookingFlowServiceError: class extends Error {
    constructor(message: string, public code: string) { super(message); }
  },
}));
vi.mock("@/server/services/audit-log.service", () => ({ logDiagnosticEvent: mocks.diagnostic }));

const redirectSignal = new Error("NEXT_REDIRECT");
const paths = [
  "/client/bookings", "/client/dashboard", "/client/book/therapist-1",
  "/therapist/requests", "/therapist/dashboard", "/admin/bookings", "/admin/dashboard",
];

function form() {
  const data = new FormData();
  data.set("therapistId", "therapist-1");
  data.set("startsAt", "2030-08-25T09:00:00Z");
  data.set("endsAt", "2030-08-25T10:00:00Z");
  data.set("notes", "PRIVATE_REQUEST_SENTINEL");
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ id: "client-1", role: UserRole.CLIENT });
  mocks.create.mockResolvedValue({ id: "booking-1" });
  mocks.redirect.mockImplementation(() => { throw redirectSignal; });
});

describe("booking request commit boundary", () => {
  it("redirects after successful creation and invalidates every required path", async () => {
    await expect(createBookingRequestAction({ status: "idle" }, form())).rejects.toBe(redirectSignal);
    expect(mocks.authorize).toHaveBeenCalledWith([UserRole.CLIENT], expect.any(String));
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith("client-1", expect.objectContaining({ therapistId: "therapist-1" }));
    expect(mocks.revalidate.mock.calls).toEqual(paths.map(path => [path]));
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/client/bookings/booking-1");
    expect(mocks.diagnostic).not.toHaveBeenCalled();
  });

  it.each(paths)("redirects without a second create when cache invalidation fails: %s", async failedPath => {
    mocks.revalidate.mockImplementation(path => {
      if (path === failedPath) throw new Error("PRIVATE_CACHE_SENTINEL");
    });
    await expect(createBookingRequestAction({ status: "idle" }, form())).rejects.toBe(redirectSignal);
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.revalidate.mock.calls).toEqual(paths.map(path => [path]));
    expect(mocks.redirect).toHaveBeenCalledWith("/client/bookings/booking-1");
    expect(mocks.diagnostic).toHaveBeenCalledExactlyOnceWith(
      "booking-request-action", expect.any(String),
      { bookingId: "booking-1", phase: "post_commit_revalidation", path: failedPath },
    );
    expect(JSON.stringify(mocks.diagnostic.mock.calls)).not.toContain("PRIVATE_");
  });

  it.each(["transaction rejected", "commit result unknown"])("does not redirect or retry when %s", async failure => {
    mocks.create.mockRejectedValue(new Error(failure + " PRIVATE_DATABASE_SENTINEL PRIVATE_OAUTH_SENTINEL"));
    expect(await createBookingRequestAction({ status: "idle" }, form())).toEqual({
      status: "error", code: "unknown", message: "Something went wrong while creating the booking request.",
    });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.diagnostic).toHaveBeenCalledExactlyOnceWith(
      "booking-request-action", expect.any(String), { phase: "creation", outcome: "not_confirmed" },
    );
    expect(JSON.stringify(mocks.diagnostic.mock.calls)).not.toContain("PRIVATE_");
  });

  it("rejects invalid input without creating a booking", async () => {
    const data = form();
    data.set("endsAt", "2030-08-25T08:00:00Z");
    expect(await createBookingRequestAction({ status: "idle" }, data)).toMatchObject({ status: "error", code: "validation" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["unauthenticated", "wrong role", "inactive client"])("rejects %s before creation", async reason => {
    mocks.authorize.mockRejectedValue(new ActionPermissionError(reason));
    expect(await createBookingRequestAction({ status: "idle" }, form())).toMatchObject({ status: "error", code: "permission" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("preserves the safe slot-conflict response without retrying", async () => {
    mocks.create.mockRejectedValue(new BookingFlowServiceError("PRIVATE_CONFLICT_SENTINEL", "SLOT_CONFLICT"));
    const result = await createBookingRequestAction({ status: "idle" }, form());
    expect(result).toMatchObject({ status: "error", code: "conflict" });
    expect(result.message).not.toContain("PRIVATE_");
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("reports temporary calendar verification failure separately from a busy slot", async () => {
    mocks.create.mockRejectedValue(new BookingFlowServiceError("PRIVATE_PROVIDER_SENTINEL", "GOOGLE_CALENDAR_UNAVAILABLE"));
    expect(await createBookingRequestAction({ status: "idle" }, form())).toEqual({
      status: "error", code: "unknown",
      message: "We could not verify calendar availability right now. Please try again.",
    });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("preserves the 60-minute duration requirement", async () => {
    const data = form(); data.set("endsAt", "2030-08-25T10:30:00Z");
    expect(await createBookingRequestAction({ status: "idle" }, data)).toMatchObject({ code: "validation" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
