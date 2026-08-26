import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getAvailabilityCountLabel,
  getVisibleAvailabilitySlots,
} from "@/lib/booking-availability-presentation";
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

describe("booking availability presentation", () => {
  it("hides lead-time slots while preserving available and booked slots", () => {
    const available = slot(9, { isAvailable: true, unavailableReason: undefined });
    const booked = slot(10, { isAvailable: false, unavailableReason: "conflict" });
    const tooLate = slot(11, { isAvailable: false, unavailableReason: "lead_time" });

    const visible = getVisibleAvailabilitySlots([available, booked, tooLate]);

    expect(visible).toEqual([available, booked]);
    expect(visible[0]?.isAvailable).toBe(true);
    expect(visible[1]).toMatchObject({ isAvailable: false, unavailableReason: "conflict" });
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

  it("keeps booked slots visibly disabled and available slots selectable", () => {
    const source = readFileSync(
      new URL("../../src/components/booking/client/slot-card.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("aria-disabled");
    expect(source).toContain('slot.isAvailable ? "Available" : "Booked"');
    expect(source).toContain("<RequestSlotForm");
    expect(source).toContain("This time is already booked.");
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
