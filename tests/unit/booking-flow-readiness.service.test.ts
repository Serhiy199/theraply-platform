import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBookableTherapistWhere } from "@/lib/therapist-readiness";

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  userFindFirst: vi.fn(),
  bookingFindFirst: vi.fn(),
  transaction: vi.fn(),
  getGoogleAvailability: vi.fn(),
  hasGoogleConflict: vi.fn(),
  sendRequestEmails: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: mocks.userFindMany,
      findFirst: mocks.userFindFirst,
    },
    booking: {
      findFirst: mocks.bookingFindFirst,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: vi.fn(),
}));

vi.mock("@/server/services/google-availability.service", () => {
  class GoogleAvailabilityServiceError extends Error {}
  return {
    GoogleAvailabilityServiceError,
    getTherapistGoogleAvailability: mocks.getGoogleAvailability,
    hasTherapistGoogleCalendarBusyConflict: mocks.hasGoogleConflict,
  };
});

vi.mock("@/server/services/google-calendar.service", () => {
  class GoogleCalendarServiceError extends Error {}
  return {
    GoogleCalendarServiceError,
    createTherapistGoogleCalendarEvent: vi.fn(),
    deleteTherapistGoogleCalendarEvent: vi.fn(),
  };
});

vi.mock("@/server/services/payment-flow.service", () => ({
  getPaymentDueBy: vi.fn(),
}));

vi.mock("@/server/services/refund.service", () => {
  class RefundServiceError extends Error {}
  return {
    RefundServiceError,
    refundPlatformCancellationIfEligible: vi.fn(),
  };
});

vi.mock("@/server/services/therapist-transfer.service", () => ({
  createTherapistTransferForBooking: vi.fn(),
}));

vi.mock("@/server/services/transactional-email-events.service", () => ({
  sendBookingCancelledEmailsBestEffort: vi.fn(),
  sendBookingConfirmedEmailBestEffort: vi.fn(),
  sendBookingRejectedEmailBestEffort: vi.fn(),
  sendBookingRequestCreatedEmailsBestEffort: mocks.sendRequestEmails,
}));

import {
  BookingFlowServiceError,
  createBookingRequest,
  getBookableTherapistById,
  getBookableTherapists,
  getTherapistAvailability,
} from "@/server/services/booking-flow.service";

const therapist = {
  id: "therapist-1",
  email: "ready@example.test",
  emailVerified: true,
  firstName: "Ready",
  lastName: "Therapist",
  therapistProfile: {
    id: "profile-1",
    displayName: "Ready Therapist",
  },
};

describe("booking flow canonical therapist readiness", () => {
  beforeEach(() => {
    mocks.userFindMany.mockReset();
    mocks.userFindFirst.mockReset();
    mocks.bookingFindFirst.mockReset();
    mocks.transaction.mockReset();
    mocks.getGoogleAvailability.mockReset();
    mocks.hasGoogleConflict.mockReset();
    mocks.sendRequestEmails.mockReset();
  });

  it("uses the canonical predicate when listing therapists", async () => {
    mocks.userFindMany.mockResolvedValue([therapist]);

    await expect(getBookableTherapists()).resolves.toEqual([therapist]);
    expect(mocks.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: buildBookableTherapistWhere() }),
    );
  });

  it("uses the same predicate for direct therapist lookup", async () => {
    mocks.userFindFirst.mockResolvedValue(therapist);

    await expect(getBookableTherapistById("therapist-1")).resolves.toEqual(therapist);
    expect(mocks.userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ...buildBookableTherapistWhere(), id: "therapist-1" },
      }),
    );
  });

  it("fails closed when the canonical direct lookup finds no ready therapist", async () => {
    mocks.userFindFirst.mockResolvedValue(null);

    await expect(getBookableTherapistById("not-ready")).rejects.toMatchObject({
      code: "THERAPIST_NOT_BOOKABLE",
    } satisfies Partial<BookingFlowServiceError>);
  });

  it("checks canonical readiness before requesting live Google availability", async () => {
    const startsAt = new Date("2030-08-25T09:00:00.000Z");
    const endsAt = new Date("2030-08-25T10:00:00.000Z");
    mocks.userFindFirst.mockResolvedValue(therapist);
    mocks.getGoogleAvailability.mockResolvedValue([
      { therapistId: "therapist-1", startsAt, endsAt, isAvailable: true, timeZone: "Europe/London" },
    ]);

    const result = await getTherapistAvailability("therapist-1", startsAt, endsAt);

    expect(mocks.userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ...buildBookableTherapistWhere(), id: "therapist-1" },
      }),
    );
    expect(mocks.getGoogleAvailability).toHaveBeenCalledWith("therapist-1", startsAt, endsAt);
    expect(result).toHaveLength(1);
  });

  it("creates a request only after client and canonical therapist gates", async () => {
    const startsAt = new Date("2030-08-25T09:00:00.000Z");
    const endsAt = new Date("2030-08-25T10:00:00.000Z");
    const createdBooking = { id: "booking-1" };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      booking: { create: vi.fn().mockResolvedValue(createdBooking) },
    };

    mocks.userFindFirst
      .mockResolvedValueOnce({ id: "client-1" })
      .mockResolvedValueOnce(therapist);
    mocks.bookingFindFirst.mockResolvedValue(null);
    mocks.hasGoogleConflict.mockResolvedValue(false);
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      createBookingRequest("client-1", {
        therapistId: "therapist-1",
        startsAt,
        endsAt,
      }),
    ).resolves.toEqual(createdBooking);

    expect(mocks.userFindFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { ...buildBookableTherapistWhere(), id: "therapist-1" },
      }),
    );
    expect(tx.booking.create).toHaveBeenCalledOnce();
    expect(mocks.sendRequestEmails).toHaveBeenCalledWith("booking-1");
  });
});
