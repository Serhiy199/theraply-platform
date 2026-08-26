import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  getAvailabilityCountLabel,
  getVisibleAvailabilitySlots,
} from "@/lib/booking-availability-presentation";
import { applyBookingAvailabilityPolicy } from "@/lib/booking-availability-policy";
import { bookingRequestSchema } from "@/lib/validations/booking-flow";
import type { TherapistAvailabilitySlot } from "@/server/services/booking-flow.service";

function slot(
  hour: number,
  options: Pick<TherapistAvailabilitySlot, "isAvailable" | "unavailableReason">,
): TherapistAvailabilitySlot {
  return {
    therapistId: "therapist-id",
    startsAt: new Date(Date.UTC(2026, 7, 26, hour)),
    endsAt: new Date(Date.UTC(2026, 7, 26, hour + 1)),
    timeZone: "Europe/London",
    ...options,
  };
}

function slotAfter(
  now: Date,
  hours: number,
  options: Pick<TherapistAvailabilitySlot, "isAvailable" | "unavailableReason">,
) {
  const result = slot(9, options);
  result.startsAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
  result.endsAt = new Date(result.startsAt.getTime() + 60 * 60 * 1000);
  return result;
}

describe("booking availability presentation", () => {
  it("applies lead time before availability for available and conflict slots", () => {
    const now = new Date("2026-08-26T08:00:00.000Z");
    const insideCutoffAvailable = applyBookingAvailabilityPolicy(
      slotAfter(now, 20, { isAvailable: true, unavailableReason: undefined }),
      now,
    );
    const insideCutoffConflict = applyBookingAvailabilityPolicy(
      slotAfter(now, 20, { isAvailable: false, unavailableReason: undefined }),
      now,
    );
    const outsideCutoffAvailable = applyBookingAvailabilityPolicy(
      slotAfter(now, 30, { isAvailable: true, unavailableReason: undefined }),
      now,
    );
    const outsideCutoffConflict = applyBookingAvailabilityPolicy(
      slotAfter(now, 30, { isAvailable: false, unavailableReason: undefined }),
      now,
    );

    expect(insideCutoffAvailable.unavailableReason).toBe("lead_time");
    expect(insideCutoffConflict.unavailableReason).toBe("lead_time");
    expect(outsideCutoffAvailable).toMatchObject({ isAvailable: true });
    expect(outsideCutoffConflict).toMatchObject({
      isAvailable: false,
      unavailableReason: "conflict",
    });

    expect(
      getVisibleAvailabilitySlots([
        insideCutoffAvailable,
        insideCutoffConflict,
        outsideCutoffAvailable,
        outsideCutoffConflict,
      ]),
    ).toEqual([outsideCutoffAvailable, outsideCutoffConflict]);
  });

  it("uses the authoritative inclusive 25-hour boundary", () => {
    const now = new Date("2026-08-26T08:00:00.000Z");
    const underCutoff = slot(8, { isAvailable: true, unavailableReason: undefined });
    underCutoff.startsAt = new Date(now.getTime() + (25 * 60 * 60 * 1000) - 1_000);
    const exactCutoff = slot(8, { isAvailable: true, unavailableReason: undefined });
    exactCutoff.startsAt = new Date(now.getTime() + (25 * 60 * 60 * 1000));
    const overCutoff = slot(8, { isAvailable: true, unavailableReason: undefined });
    overCutoff.startsAt = new Date(now.getTime() + (25 * 60 * 60 * 1000) + 1_000);

    expect(applyBookingAvailabilityPolicy(underCutoff, now).unavailableReason).toBe("lead_time");
    expect(applyBookingAvailabilityPolicy(exactCutoff, now).unavailableReason).toBeUndefined();
    expect(applyBookingAvailabilityPolicy(overCutoff, now).unavailableReason).toBeUndefined();
  });

  it("hides expired-only days and keeps future booked-only and mixed days", () => {
    const expiredAvailable = slot(9, { isAvailable: false, unavailableReason: "lead_time" });
    const expiredConflict = slot(10, { isAvailable: false, unavailableReason: "lead_time" });
    const futureAvailable = slot(11, { isAvailable: true, unavailableReason: undefined });
    const futureBooked = slot(12, { isAvailable: false, unavailableReason: "conflict" });

    expect(getVisibleAvailabilitySlots([expiredAvailable])).toEqual([]);
    expect(getVisibleAvailabilitySlots([expiredConflict])).toEqual([]);
    expect(getVisibleAvailabilitySlots([futureBooked])).toEqual([futureBooked]);
    expect(getAvailabilityCountLabel([futureBooked])).toBe("Fully booked");
    expect(
      getVisibleAvailabilitySlots([
        expiredAvailable,
        expiredConflict,
        futureAvailable,
        futureBooked,
      ]),
    ).toEqual([futureAvailable, futureBooked]);
  });

  it("rejects a manually crafted booking request inside the lead-time window", () => {
    const now = new Date("2026-08-26T08:00:00.000Z");
    const startsAt = new Date(now.getTime() + 20 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    vi.useFakeTimers();
    vi.setSystemTime(now);
    const result = bookingRequestSchema.safeParse({
      therapistId: "therapist-id",
      startsAt,
      endsAt,
      notes: "",
    });
    vi.useRealTimers();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.startsAt).toContain(
        "Sessions must be booked at least 25 hours in advance.",
      );
    }
  });

  it("uses a concise count based only on visible slots", () => {
    expect(
      getAvailabilityCountLabel([
        slot(9, { isAvailable: true, unavailableReason: undefined }),
        slot(10, { isAvailable: false, unavailableReason: "conflict" }),
      ]),
    ).toBe("1 available");
    expect(
      getAvailabilityCountLabel([
        slot(10, { isAvailable: false, unavailableReason: "conflict" }),
      ]),
    ).toBe("Fully booked");
  });

  it("keeps the consolidated client copy and removes duplicated explanations", () => {
    const source = readFileSync(
      new URL("../../src/components/booking/client/therapist-availability.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("Choose an available time");
    expect(source).toContain("Available sessions for the next");
    expect(source).toContain("All times are shown in UK time.");
    expect(source).toContain("at least 25 hours before the start time");
    expect(source).not.toContain("Calendar sync:");
    expect(source).not.toContain("Slots ready for booking");
    expect(source).not.toContain("Available slots are generated from the current booking window");
    expect(source).not.toContain("Unavailable cards are shown too");
  });

  it("keeps one concise therapist-selection introduction", () => {
    const source = readFileSync(
      new URL("../../src/components/booking/client/therapist-picker.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("Client booking flow");
    expect(source).toContain("Choose a therapist");
    expect(source).toContain(
      "Select a therapist to view their available appointment times for the next 14 days.",
    );
    expect(source).toContain("bookable therapist");
    expect(source).toContain('therapists.length === 1 ? "" : "s"');
    expect(source).not.toContain("Choose the best fit");
    expect(source).not.toContain(
      "Start a new booking request by choosing the therapist you want to work with.",
    );
    expect(source).not.toContain("Select a therapist to continue into slot selection.");
    expect(source).not.toContain(
      "Booking requests are created on the next step and stay pending until the therapist responds.",
    );
  });

  it("keeps booked slots visibly disabled and available slots selectable", () => {
    const source = readFileSync(
      new URL("../../src/components/booking/client/slot-card.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("aria-disabled");
    expect(source).toContain('slot.isAvailable ? "Available" : "Booked"');
    expect(source).toContain("<RequestSlotForm");
    expect(source).toContain("This time is already booked.");

    const requestFormSource = readFileSync(
      new URL("../../src/components/booking/client/request-slot-form.tsx", import.meta.url),
      "utf8",
    );
    expect(requestFormSource).not.toContain("Slot conflict");
  });

  it("removes the shared signed-in hero while preserving sidebar account controls", () => {
    const shell = readFileSync(
      new URL("../../src/components/dashboard/dashboard-shell.tsx", import.meta.url),
      "utf8",
    );
    const sidebar = readFileSync(
      new URL("../../src/components/dashboard/dashboard-sidebar.tsx", import.meta.url),
      "utf8",
    );

    expect(shell).not.toContain("DashboardHeader");
    expect(sidebar).toContain("getUserDisplayName");
    expect(sidebar).toContain("<LogoutButton block");
  });
});
