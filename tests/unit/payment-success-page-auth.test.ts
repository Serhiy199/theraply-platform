import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@prisma/client";
import ClientPaymentSuccessPage from "@/app/client/payments/success/page";

const mocks = vi.hoisted(() => ({ role: vi.fn(), booking: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requireRole: mocks.role }));
vi.mock("@/server/services/client-bookings.service", () => ({ getClientBookingById: mocks.booking }));
vi.mock("@/server/services/payment-flow.service", () => ({
  syncClientStripeCheckoutSuccess: mocks.sync,
  PaymentFlowServiceError: class extends Error {},
}));
vi.mock("@/server/services/audit-log.service", () => ({ logDiagnosticEvent: vi.fn() }));
vi.mock("@/components/dashboard/client/client-payment-result", () => ({ ClientPaymentResult: () => null }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "authorized-client" });
  mocks.booking.mockResolvedValue({ payment: { paymentStatus: "PENDING" } });
});

describe("success page keeps the existing CLIENT authorization boundary", () => {
  it.each(["unauthenticated", "wrong-role", "inactive-user"])("does not reconcile when requireRole rejects %s", async reason => {
    mocks.role.mockRejectedValue(new Error(reason));
    await expect(ClientPaymentSuccessPage({ searchParams: Promise.resolve({ bookingId: "booking", session_id: "cs_test_unit" }) }))
      .rejects.toThrow(reason);
    expect(mocks.role).toHaveBeenCalledWith([UserRole.CLIENT]);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.booking).not.toHaveBeenCalled();
  });

  it("passes the authenticated identity to reconciliation and the owned-booking reader", async () => {
    await ClientPaymentSuccessPage({ searchParams: Promise.resolve({ bookingId: "booking", session_id: "cs_test_unit" }) });
    expect(mocks.sync).toHaveBeenCalledWith("authorized-client", "booking", "cs_test_unit");
    expect(mocks.booking).toHaveBeenCalledWith("authorized-client", "booking");
  });
});
