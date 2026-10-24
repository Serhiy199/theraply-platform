import { PrismaClient, BookingStatus } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined, rollbackNext: false, google: vi.fn(), notify: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({} as PrismaClient, {
  get(_target, key: keyof PrismaClient) {
    const db = state.db;
    if (!db) throw new Error("Disposable PostgreSQL not initialized");
    if (key === "$transaction") return (callback: (tx: unknown) => Promise<unknown>, options: object) =>
      db.$transaction(async tx => {
        const result = await callback(tx);
        if (state.rollbackNext) { state.rollbackNext = false; throw new Error("forced test rollback"); }
        return result;
      }, options);
    const value = db[key];
    return typeof value === "function" ? value.bind(db) : value;
  },
}) }));
vi.mock("@/server/services/google-availability.service", () => ({
  GoogleAvailabilityServiceError: class extends Error {},
  getTherapistGoogleAvailability: vi.fn(), hasTherapistGoogleCalendarBusyConflict: state.google,
}));
vi.mock("@/server/services/google-calendar.service", () => ({
  GoogleCalendarServiceError: class extends Error {}, createTherapistGoogleCalendarEvent: vi.fn(), deleteTherapistGoogleCalendarEvent: vi.fn(),
}));
vi.mock("@/server/services/payment-flow.service", () => ({ getPaymentDueBy: vi.fn() }));
vi.mock("@/server/services/refund.service", () => ({ RefundServiceError: class extends Error {}, refundPlatformCancellationIfEligible: vi.fn() }));
vi.mock("@/server/services/therapist-transfer.service", () => ({ createTherapistTransferForBooking: vi.fn() }));
vi.mock("@/server/services/audit-log.service", () => ({ createAuditLogEntryBestEffort: vi.fn(), logDiagnosticEvent: vi.fn() }));
vi.mock("@/server/services/transactional-email-events.service", () => ({
  sendBookingCancelledEmailsBestEffort: vi.fn(), sendBookingConfirmedEmailBestEffort: vi.fn(),
  sendBookingRejectedEmailBestEffort: vi.fn(), sendBookingRequestCreatedEmailsBestEffort: state.notify,
}));
import { createBookingRequest } from "@/server/services/booking-flow.service";

const url = process.env.THERAPLY_DISPOSABLE_POSTGRES_URL;
const ids = { therapist: "resilience-pg-therapist", clients: ["resilience-pg-client-1", "resilience-pg-client-2"] };
const slot = { therapistId: ids.therapist, startsAt: new Date("2030-08-25T09:00:00Z"), endsAt: new Date("2030-08-25T10:00:00Z") };

// Never fall back to DATABASE_URL. A separate empty, loopback-only disposable DB is mandatory.
describe.skipIf(!url)("real isolated PostgreSQL booking concurrency", () => {
  let db: PrismaClient;
  let ownsFixtures = false;
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.protocol !== "postgresql:" || parsed.hostname !== "127.0.0.1" || parsed.port !== "65439" || parsed.pathname !== "/theraply_booking_resilience_test" || parsed.username !== "theraply_booking_test" || [...parsed.searchParams.keys()].some(k => k !== "schema") || (parsed.searchParams.get("schema") ?? "public") !== "public") {
      throw new Error("REFUSED: not the isolated loopback PostgreSQL test target");
    }
    db = new PrismaClient({ datasources: { db: { url } }, log: [] }); state.db = db;
    const identity = await db.$queryRaw<Array<{ database: string; schema: string }>>`SELECT current_database() AS database, current_schema() AS schema`;
    expect(identity).toEqual([{ database: "theraply_booking_resilience_test", schema: "public" }]);
    expect(await db.user.count()).toBe(0);
    expect(await db.booking.count()).toBe(0);
    await db.user.create({ data: {
      id: ids.therapist, email: "therapist@resilience.invalid", passwordHash: "not-a-real-password-hash", role: "THERAPIST", emailVerified: true,
      therapistProfile: { create: { displayName: "Synthetic local PostgreSQL fixture", approvalStatus: "APPROVED", isApproved: true, onboardingCompleted: true,
        sessionPricePence: 100, isGoogleCalendarConnected: true, googleCalendarId: "mock-calendar", googleRefreshToken: "mock-local-token",
        stripeAccountId: "acct_mock_local", stripePayoutsEnabled: true, stripeDetailsSubmitted: true } },
    } });
    ownsFixtures = true;
    for (const id of ids.clients) await db.user.create({ data: { id, email: `${id}@resilience.invalid`, passwordHash: "not-a-real-password-hash", role: "CLIENT", clientProfile: { create: {} } } });
  });

  beforeEach(async () => {
    await db.booking.deleteMany({ where: { therapistId: ids.therapist } });
    state.rollbackNext = false; state.google.mockReset().mockResolvedValue(false); state.notify.mockReset();
  });

  afterAll(async () => {
    if (!db) return;
    if (ownsFixtures) {
      await db.booking.deleteMany({ where: { therapistId: ids.therapist } });
      await db.user.deleteMany({ where: { id: { in: [ids.therapist, ...ids.clients] } } });
    }
    await db.$disconnect(); state.db = undefined;
  });

  it.each([
    ["identical/different clients", 0, false, 1], ["identical/same client", 0, true, 1],
    ["overlap/different clients", 30, false, 1], ["overlap/same client", -30, true, 1],
    ["adjacent", 60, false, 2], ["nonoverlapping", 120, false, 2],
  ] as const)("serializes %s on real PostgreSQL", async (_label, minutes, sameClient, count) => {
    let arrived = 0; let release!: () => void;
    const bothPreflighted = new Promise<void>(resolve => { release = resolve; });
    state.google.mockImplementation(async () => { if (++arrived === 2) release(); await bothPreflighted; return false; });
    const second = { ...slot, startsAt: new Date(slot.startsAt.getTime() + minutes * 60_000), endsAt: new Date(slot.endsAt.getTime() + minutes * 60_000) };
    const results = await Promise.allSettled([createBookingRequest(ids.clients[0], slot), createBookingRequest(ids.clients[sameClient ? 0 : 1], second)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(count);
    if (count === 1) expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "SLOT_CONFLICT" } });
    expect(await db.booking.count()).toBe(count);
    expect(await db.session.count()).toBe(0); expect(await db.payment.count()).toBe(0);
    expect(state.notify).toHaveBeenCalledTimes(count);
  });

  it.each([BookingStatus.PENDING_THERAPIST, BookingStatus.CONFIRMED, BookingStatus.CANCELLED, BookingStatus.REJECTED, BookingStatus.AUTO_CANCELLED])("preserves %s overlap policy", async bookingStatus => {
    await db.booking.create({ data: { ...slot, clientId: ids.clients[0], bookingStatus } });
    const result = createBookingRequest(ids.clients[1], slot);
    if (bookingStatus === BookingStatus.PENDING_THERAPIST || bookingStatus === BookingStatus.CONFIRMED) await expect(result).rejects.toMatchObject({ code: "SLOT_CONFLICT" });
    else await expect(result).resolves.toMatchObject({ bookingStatus: "PENDING_THERAPIST" });
  });

  it("rolls back a real insert, releases its lock, and allows the next request", async () => {
    state.rollbackNext = true;
    await expect(createBookingRequest(ids.clients[0], slot)).rejects.toThrow("forced test rollback");
    expect(await db.booking.count()).toBe(0); expect(state.notify).not.toHaveBeenCalled();
    await expect(createBookingRequest(ids.clients[1], slot)).resolves.toMatchObject({ bookingStatus: "PENDING_THERAPIST" });
    expect(await db.booking.count()).toBe(1);
  });

  it("bounds real advisory lock contention and does not create or retry", async () => {
    let held!: () => void; let release!: () => void;
    const acquired = new Promise<void>(resolve => { held = resolve; });
    const finish = new Promise<void>(resolve => { release = resolve; });
    const holder = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('theraply-booking'), hashtext(${ids.therapist}))::text`;
      held(); await finish;
    });
    await acquired;
    try { await expect(createBookingRequest(ids.clients[0], slot)).rejects.toMatchObject({ code: "SLOT_CONFLICT" }); }
    finally { release(); await holder; }
    expect(await db.booking.count()).toBe(0); expect(state.notify).not.toHaveBeenCalled();
  });
});
