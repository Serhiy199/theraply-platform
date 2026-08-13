import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTherapistStripeAccountLink } from "@/server/services/stripe-connect.service";

const therapistProfileFindFirstMock = vi.hoisted(() => vi.fn());
const therapistProfileUpdateMock = vi.hoisted(() => vi.fn());
const accountLinksCreateMock = vi.hoisted(() => vi.fn());
const createAuditLogEntryBestEffortMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    therapistProfile: {
      findFirst: therapistProfileFindFirstMock,
      update: therapistProfileUpdateMock,
    },
  },
}));

vi.mock("@/lib/stripe/stripe-config", () => ({
  isStripeConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/stripe/stripe", () => ({
  getStripeClient: vi.fn(() => ({
    accounts: {
      create: vi.fn(),
    },
    accountLinks: {
      create: accountLinksCreateMock,
    },
  })),
}));

vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: createAuditLogEntryBestEffortMock,
  logDiagnosticEvent: vi.fn(),
}));

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://staging-or-test.example/");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://public-fallback.example");
  therapistProfileFindFirstMock.mockResolvedValue({
    id: "therapist-profile-id",
    userId: "therapist-user-id",
    displayName: "Test Therapist",
    user: {
      email: "therapist@example.com",
      firstName: "Test",
      lastName: "Therapist",
    },
    stripeAccountId: "acct_existing",
    stripeOnboardingStatus: "ACCOUNT_CREATED",
    stripeChargesEnabled: false,
    stripePayoutsEnabled: false,
    stripeDetailsSubmitted: false,
    stripeOnboardingCompletedAt: null,
    stripeAccountSyncedAt: null,
    stripeDisabledReason: null,
  });
  accountLinksCreateMock.mockResolvedValue({
    url: "https://connect.stripe.test/account-link",
  });
  therapistProfileUpdateMock.mockResolvedValue({});
  createAuditLogEntryBestEffortMock.mockResolvedValue({});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("createTherapistStripeAccountLink", () => {
  it("uses canonical callback URLs for an existing connected account", async () => {
    const result = await createTherapistStripeAccountLink("therapist-user-id");

    expect(accountLinksCreateMock).toHaveBeenCalledWith({
      account: "acct_existing",
      refresh_url: "https://staging-or-test.example/api/stripe/connect/refresh",
      return_url: "https://staging-or-test.example/api/stripe/connect/return",
      type: "account_onboarding",
    });
    expect(result).toEqual({
      url: "https://connect.stripe.test/account-link",
      stripeAccountId: "acct_existing",
    });
  });
});
