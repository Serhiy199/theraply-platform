import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TherapistApprovalStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TherapistPayoutForm } from "@/components/dashboard/therapist/therapist-payout-form";
import type { TherapistPayoutDetailsView } from "@/server/services/therapist-bookings.service";

const mocks = vi.hoisted(() => ({ nextLink: vi.fn(() => null), savePrice: vi.fn(), saveCalendar: vi.fn() }));
vi.mock("next/link", () => ({ default: mocks.nextLink }));
vi.mock("@/app/therapist/payout-details/actions", () => ({
  payoutDetailsAction: mocks.savePrice,
  googleCalendarSelectionAction: mocks.saveCalendar,
}));

const data: TherapistPayoutDetailsView = {
  profile: {
    displayName: "Unit test therapist", specialization: "Test only",
    approvalStatus: TherapistApprovalStatus.APPROVED, sessionPricePence: 100,
    googleCalendarId: null, googleCalendarEmail: null, isGoogleCalendarConnected: false,
    googleCalendarConnectedAt: null, stripeAccountId: "acct_existing_mock",
    stripeOnboardingStatus: "ONBOARDING_STARTED", stripeChargesEnabled: false,
    stripePayoutsEnabled: false, stripeDetailsSubmitted: false,
    stripeOnboardingCompletedAt: null, stripeAccountSyncedAt: null, stripeDisabledReason: null,
  },
  payoutDetails: null,
};

afterEach(() => vi.clearAllMocks());

describe("Therapist Connect controls", () => {
  it.each(["open", "refresh", "navigation"])("renders explicit POST forms and no prefetch links during %s", () => {
    const html = renderToStaticMarkup(createElement(TherapistPayoutForm, { data, googleCalendars: [] }));
    expect(html).toContain('action="/api/stripe/connect/account-link"');
    expect(html).toContain('action="/api/integrations/google/connect?returnTo=%2Ftherapist%2Fpayout-details"');
    expect(html.match(/method="post"/g)).toHaveLength(2);
    expect(html.match(/name="intent"/g)).toHaveLength(2);
    expect(html).toContain('value="stripe-connect"');
    expect(html).toContain('value="google-connect"');
    expect(html).not.toMatch(/href="\/api\/(stripe\/connect|integrations\/google\/connect)/);
    expect(mocks.nextLink).not.toHaveBeenCalled();
    expect(mocks.savePrice).not.toHaveBeenCalled();
    expect(mocks.saveCalendar).not.toHaveBeenCalled();
  });
});
