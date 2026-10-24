import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { buildBookableTherapistWhere } from "@/lib/therapist-readiness";

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  userFindFirst: vi.fn(),
  bookingFindFirst: vi.fn(),
  transaction: vi.fn(),
  getGoogleAvailability: vi.fn(),
  hasGoogleConflict: vi.fn(),
  sendRequestEmails: vi.fn(),
  diagnostic: vi.fn(),
  createEvent: vi.fn(),
  deleteEvent: vi.fn(),
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
  logDiagnosticEvent: mocks.diagnostic,
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
    createTherapistGoogleCalendarEvent: mocks.createEvent,
    deleteTherapistGoogleCalendarEvent: mocks.deleteEvent,
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
  confirmBookingRequest,
  getBookableTherapistById,
  getBookableTherapists,
  getTherapistAvailability,
} from "@/server/services/booking-flow.service";
import { GoogleAvailabilityServiceError } from "@/server/services/google-availability.service";
import { confirmTherapistBooking } from "@/server/services/therapist-bookings.service";

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
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      user: { findFirst: vi.fn().mockImplementation(async ({ where }) => where.role === "CLIENT" ? { id: "client-1" } : therapist) },
      booking: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(createdBooking) },
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

describe("booking creation transaction and notification boundary", () => {
  const input = {
    therapistId: "therapist-1",
    startsAt: new Date("2030-08-25T09:00:00Z"),
    endsAt: new Date("2030-08-25T10:00:00Z"),
  };
  const createdBooking = { id: "booking-1" };
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    user: { findFirst: vi.fn() },
    booking: { findFirst: vi.fn(), create: vi.fn() },
  };
  let sequence: string[];
  afterEach(() => { vi.useRealTimers(); });

  beforeEach(() => {
    vi.resetAllMocks();
    sequence = [];
    mocks.userFindFirst.mockResolvedValueOnce({ id: "client-1" }).mockResolvedValueOnce(therapist);
    mocks.bookingFindFirst.mockResolvedValue(null);
    mocks.hasGoogleConflict.mockResolvedValue(false);
    tx.$queryRaw.mockResolvedValue([{ locked: true }]);
    tx.user.findFirst.mockImplementation(async ({ where }) => where.role === "CLIENT" ? { id: "client-1" } : therapist);
    tx.booking.findFirst.mockResolvedValue(null);
    tx.booking.create.mockResolvedValue(createdBooking);
    mocks.transaction.mockImplementation(async callback => {
      const result = await callback(tx);
      sequence.push("commit");
      return result;
    });
    mocks.sendRequestEmails.mockImplementation(async () => { sequence.push("notification"); });
  });

  it("returns the committed booking after sending notifications in the normal order", async () => {
    await expect(createBookingRequest("client-1", input)).resolves.toEqual(createdBooking);
    expect(sequence).toEqual(["commit", "notification"]);
    expect(tx.booking.create).toHaveBeenCalledOnce();
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.sendRequestEmails).toHaveBeenCalledExactlyOnceWith("booking-1");
  });

  it("preserves committed creation when the best-effort notification unexpectedly rejects", async () => {
    mocks.sendRequestEmails.mockImplementation(async () => {
      sequence.push("notification");
      throw new Error("PRIVATE_EMAIL_SENTINEL PRIVATE_OAUTH_SENTINEL");
    });
    await expect(createBookingRequest("client-1", input)).resolves.toEqual(createdBooking);
    expect(sequence).toEqual(["commit", "notification"]);
    expect(tx.booking.create).toHaveBeenCalledOnce();
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.sendRequestEmails).toHaveBeenCalledOnce();
    expect(mocks.diagnostic).toHaveBeenCalledExactlyOnceWith(
      "booking-flow", expect.any(String), { bookingId: "booking-1", phase: "post_commit_notification" },
    );
    expect(JSON.stringify(mocks.diagnostic.mock.calls)).not.toContain("PRIVATE_");
  });

  it.each(["insert", "commit"])("propagates %s failure without notification, retry or inferred success", async phase => {
    const failure = new Error("transaction failure");
    if (phase === "insert") tx.booking.create.mockRejectedValue(failure);
    else mocks.transaction.mockImplementation(async callback => { await callback(tx); throw failure; });
    await expect(createBookingRequest("client-1", input)).rejects.toBe(failure);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(tx.booking.create).toHaveBeenCalledOnce();
    expect(mocks.sendRequestEmails).not.toHaveBeenCalled();
    expect(mocks.diagnostic).not.toHaveBeenCalled();
  });

  it.each(["slot-lock", "existing-booking", "google-busy"])("preserves conflict prevention: %s", async conflict => {
    if (conflict === "slot-lock") tx.$queryRaw.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("lock timeout", { code: "P2010", clientVersion: "test", meta: { code: "55P03" } }));
    if (conflict === "existing-booking") tx.booking.findFirst.mockResolvedValue({ id: "existing-booking" });
    if (conflict === "google-busy") mocks.hasGoogleConflict.mockResolvedValue(true);
    await expect(createBookingRequest("client-1", input)).rejects.toMatchObject({ code: "SLOT_CONFLICT" });
    expect(mocks.transaction).toHaveBeenCalledTimes(conflict === "google-busy" ? 0 : 1);
    expect(tx.booking.create).not.toHaveBeenCalled();
    expect(mocks.sendRequestEmails).not.toHaveBeenCalled();
  });

  it("rejects an ineligible client before starting a transaction", async () => {
    mocks.userFindFirst.mockReset().mockResolvedValue(null);
    await expect(createBookingRequest("client-1", input)).rejects.toMatchObject({ code: "CLIENT_NOT_ELIGIBLE" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(tx.booking.create).not.toHaveBeenCalled();
    expect(mocks.sendRequestEmails).not.toHaveBeenCalled();
  });

  it("does Google I/O before opening the transaction, then only transaction-scoped reads", async () => {
    mocks.hasGoogleConflict.mockImplementation(async () => { sequence.push("google"); return false; });
    mocks.transaction.mockImplementation(async (callback, options) => {
      expect(options).toEqual({ isolationLevel: "ReadCommitted" });
      sequence.push("begin");
      const result = await callback(tx);
      sequence.push("commit");
      return result;
    });
    tx.$queryRaw.mockImplementation(async (sql, id) => {
      expect(sql.join("?")).toContain("pg_advisory_xact_lock(hashtext('theraply-booking'), hashtext(?))");
      expect(id).toBe(input.therapistId);
      sequence.push("lock");
      return [];
    });
    tx.booking.findFirst.mockImplementation(async () => { sequence.push("overlap"); return null; });
    tx.booking.create.mockImplementation(async () => { sequence.push("create"); return createdBooking; });
    await createBookingRequest("client-1", input);
    expect(sequence).toEqual(["google", "begin", "lock", "overlap", "create", "commit", "notification"]);
    expect(mocks.bookingFindFirst).not.toHaveBeenCalled();
    expect(mocks.userFindFirst).toHaveBeenCalledTimes(2);
    expect(tx.user.findFirst).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw.mock.calls[0][0].join("")).toContain("lock_timeout = '1000ms'");
    expect(tx.booking.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      bookingStatus: { in: ["PENDING_THERAPIST", "CONFIRMED"] },
      startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt },
    }) }));
  });

  it("waits for a delayed Google check without holding a transaction", async () => {
    let resolveGoogle!: (busy: boolean) => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    mocks.hasGoogleConflict.mockImplementation(() => { entered(); return new Promise(resolve => { resolveGoogle = resolve; }); });
    const result = createBookingRequest("client-1", input);
    await started;
    expect(mocks.transaction).not.toHaveBeenCalled();
    resolveGoogle(false);
    await expect(result).resolves.toEqual(createdBooking);
  });

  it("distinguishes inconclusive Google verification from a true slot conflict", async () => {
    mocks.hasGoogleConflict.mockRejectedValue(new GoogleAvailabilityServiceError("private provider error", "GOOGLE_CALENDAR_UNAVAILABLE"));
    await expect(createBookingRequest("client-1", input)).rejects.toMatchObject({ code: "GOOGLE_CALENDAR_UNAVAILABLE" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["client", "therapist"])("rechecks %s eligibility after Google before insert", async gate => {
    tx.user.findFirst.mockImplementation(async ({ where }) =>
      (gate === "client" ? where.role === "CLIENT" : where.role === "THERAPIST") ? null : where.role === "CLIENT" ? { id: "client-1" } : therapist);
    await expect(createBookingRequest("client-1", input)).rejects.toMatchObject({
      code: gate === "client" ? "CLIENT_NOT_ELIGIBLE" : "THERAPIST_NOT_BOOKABLE",
    });
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it.each(["google", "lock"])("rechecks the 25-hour boundary after a slow %s", async delay => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(input.startsAt.getTime() - 25 * 3_600_000));
    const advance = async () => { vi.advanceTimersByTime(1); return false; };
    if (delay === "google") mocks.hasGoogleConflict.mockImplementation(advance);
    else tx.$queryRaw.mockImplementation(advance);
    await expect(createBookingRequest("client-1", input)).rejects.toMatchObject({ code: "BOOKING_LEAD_TIME" });
    expect(tx.booking.create).not.toHaveBeenCalled();
    expect(mocks.sendRequestEmails).not.toHaveBeenCalled();
  });

  it.each(["invalid-start", "reversed", "past", "too-soon"])("rejects %s before Google or a transaction", async problem => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-08-24T09:00:00Z"));
    const invalid = { ...input };
    if (problem === "invalid-start") invalid.startsAt = new Date("invalid");
    if (problem === "reversed") invalid.endsAt = input.startsAt;
    if (problem === "past") invalid.startsAt = new Date("2030-08-23T09:00:00Z");
    await expect(createBookingRequest("client-1", invalid)).rejects.toBeInstanceOf(BookingFlowServiceError);
    expect(mocks.hasGoogleConflict).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("booking concurrency contract (simulated transactions, NOT PostgreSQL proof)", () => {
  const first = { therapistId: "therapist-1", startsAt: new Date("2030-08-25T09:00:00Z"), endsAt: new Date("2030-08-25T10:00:00Z") };
  let committed: Array<typeof first & { id: string }>;
  let tails: Map<string, Promise<void>>;
  let rollbacks: number;
  let failFirstInsert: boolean;

  beforeEach(() => {
    vi.resetAllMocks();
    committed = []; tails = new Map(); rollbacks = 0; failFirstInsert = false;
    mocks.userFindFirst.mockImplementation(async ({ where }) => where.role === "CLIENT" ? { id: where.id } : therapist);
    mocks.hasGoogleConflict.mockResolvedValue(false);
    mocks.transaction.mockImplementation(async (callback, options) => {
      expect(options).toEqual({ isolationLevel: "ReadCommitted" });
      let release: (() => void) | undefined;
      const pending: typeof committed = [];
      try {
        const result = await callback({
          $executeRaw: vi.fn(),
          $queryRaw: async (sql: TemplateStringsArray, ...values: string[]) => {
            expect(sql.join("?")).toContain("pg_advisory_xact_lock");
            const key = values.join(":");
            const previous = tails.get(key) ?? Promise.resolve();
            tails.set(key, new Promise<void>(resolve => { release = resolve; }));
            await previous;
            return [];
          },
          user: { findFirst: mocks.userFindFirst },
          booking: {
            findFirst: async ({ where }: { where: { therapistId: string; startsAt: { lt: Date }; endsAt: { gt: Date } } }) =>
              committed.find(b => b.therapistId === where.therapistId && b.startsAt < where.startsAt.lt && b.endsAt > where.endsAt.gt) ?? null,
            create: async ({ data }: { data: typeof first }) => {
              if (failFirstInsert) { failFirstInsert = false; throw new Error("rolled back insert"); }
              const row = { ...data, id: `booking-${committed.length + 1}` }; pending.push(row); return row;
            },
          },
        });
        committed.push(...pending);
        return result;
      } catch (error) { rollbacks++; throw error; }
      finally { release?.(); }
    });
  });

  it.each([
    ["identical/different clients", "client-2", 0, 1],
    ["identical/same client double submit", "client-1", 0, 1],
    ["partially overlapping/different clients", "client-2", 30, 1],
    ["partially overlapping/same client", "client-1", -30, 1],
    ["adjacent nonoverlapping", "client-2", 60, 2],
    ["separated nonoverlapping", "client-2", 120, 2],
  ])("serializes %s", async (_label, client, offset, expected) => {
    const second = { ...first, startsAt: new Date(first.startsAt.getTime() + Number(offset) * 60_000), endsAt: new Date(first.endsAt.getTime() + Number(offset) * 60_000) };
    const results = await Promise.allSettled([createBookingRequest("client-1", first), createBookingRequest(String(client), second)]);
    expect(committed).toHaveLength(Number(expected));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(Number(expected));
    if (expected === 1) expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "SLOT_CONFLICT" } });
    expect(mocks.sendRequestEmails).toHaveBeenCalledTimes(Number(expected));
  });

  it("releases the lock after rollback and permits the waiting request without retry", async () => {
    failFirstInsert = true;
    const results = await Promise.allSettled([createBookingRequest("client-1", first), createBookingRequest("client-2", first)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(committed).toHaveLength(1); expect(rollbacks).toBe(1);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.sendRequestEmails).toHaveBeenCalledOnce();
  });
});

describe("confirmation cannot reactivate an inactive booking", () => {
  const pending = {
    id: "booking-1", therapistId: "therapist-1", bookingStatus: "PENDING_THERAPIST",
    startsAt: new Date("2030-08-25T09:00:00Z"), endsAt: new Date("2030-08-25T10:00:00Z"),
    client: { email: "client@example.test" }, therapist: { ...therapist }, session: null, notes: null,
  };
  const tx = {
    $executeRaw: vi.fn(), $queryRaw: vi.fn(),
    booking: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    session: { create: vi.fn(), update: vi.fn() }, auditLog: { create: vi.fn() },
  };
  let currentStatus: string;
  beforeEach(() => {
    vi.resetAllMocks(); currentStatus = "PENDING_THERAPIST";
    mocks.bookingFindFirst.mockImplementation(async ({ where }) => where.id ? pending : null);
    mocks.hasGoogleConflict.mockResolvedValue(false);
    mocks.createEvent.mockResolvedValue({ eventId: "mock-event", meetingUrl: "https://meet.example.test/test" });
    tx.booking.findFirst.mockResolvedValue(null);
    tx.booking.findUnique.mockResolvedValue({ id: "booking-1" });
    tx.booking.update.mockImplementation(async ({ where }) => {
      expect(where).toEqual({ id: "booking-1", therapistId: "therapist-1", bookingStatus: "PENDING_THERAPIST" });
      if (currentStatus !== where.bookingStatus) throw new Error("conditional update rejected");
      currentStatus = "CONFIRMED"; return pending;
    });
    mocks.transaction.mockImplementation(async callback => callback(tx));
  });

  it.each(["CANCELLED", "REJECTED", "AUTO_CANCELLED", "CONFIRMED"])("does not revive/change %s after a stale canonical read", async status => {
    currentStatus = status;
    await expect(confirmBookingRequest("therapist-1", "booking-1")).rejects.toThrow("conditional update rejected");
    expect(currentStatus).toBe(status);
    expect(tx.session.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(mocks.deleteEvent).toHaveBeenCalledExactlyOnceWith("therapist-1", "mock-event");
  });

  it("also guards the legacy therapist confirmation writer", async () => {
    currentStatus = "CANCELLED";
    await expect(confirmTherapistBooking("therapist-1", "booking-1")).rejects.toThrow("conditional update rejected");
    expect(tx.session.create).not.toHaveBeenCalled();
    expect(currentStatus).toBe("CANCELLED");
  });

  it("revalidates the local overlap under the shared therapist lock", async () => {
    tx.booking.findFirst.mockResolvedValueOnce({ id: "another-booking" });
    await expect(confirmBookingRequest("therapist-1", "booking-1")).rejects.toMatchObject({ code: "SLOT_CONFLICT" });
    expect(tx.booking.update).not.toHaveBeenCalled();
    expect(tx.session.create).not.toHaveBeenCalled();
  });

  it("keeps two stale confirmations to one Session", async () => {
    const results = await Promise.allSettled([confirmBookingRequest("therapist-1", "booking-1"), confirmBookingRequest("therapist-1", "booking-1")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(tx.session.create).toHaveBeenCalledOnce();
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
  });
});
