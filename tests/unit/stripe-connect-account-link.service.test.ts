import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTherapistStripeAccountLink } from "@/server/services/stripe-connect.service";

const therapistProfileFindFirstMock = vi.hoisted(() => vi.fn());
const therapistProfileUpdateMock = vi.hoisted(() => vi.fn());
const accountLinksCreateMock = vi.hoisted(() => vi.fn());
const accountsCreateMock = vi.hoisted(() => vi.fn());
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
      create: accountsCreateMock,
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

function buildProfile(stripeAccountId: string | null = "acct_existing") {
  return {
    id: "therapist-profile-id",
    userId: "therapist-user-id",
    displayName: "Test Therapist",
    user: {
      email: "therapist@example.com",
      firstName: "Test",
      lastName: "Therapist",
    },
    stripeAccountId,
    stripeOnboardingStatus: "ACCOUNT_CREATED",
    stripeChargesEnabled: false,
    stripePayoutsEnabled: false,
    stripeDetailsSubmitted: false,
    stripeOnboardingCompletedAt: null,
    stripeAccountSyncedAt: null,
    stripeDisabledReason: null,
  };
}

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://staging-or-test.example/");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://public-fallback.example");
  therapistProfileFindFirstMock.mockResolvedValue(buildProfile());
  accountsCreateMock.mockResolvedValue({ id: "acct_new_mock", charges_enabled: false, payouts_enabled: false, details_submitted: false });
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
    expect(accountsCreateMock).not.toHaveBeenCalled();
  });

  it("reuses the stored account on repeated explicit Connect actions", async () => {
    let storedId: string | null = null;
    therapistProfileFindFirstMock.mockImplementation(async () => buildProfile(storedId));
    therapistProfileUpdateMock.mockImplementation(async ({ data }) => {
      if (data.stripeAccountId) storedId = data.stripeAccountId;
      return {};
    });
    await createTherapistStripeAccountLink("therapist-user-id");
    await createTherapistStripeAccountLink("therapist-user-id");
    expect(accountsCreateMock).toHaveBeenCalledTimes(1);
    expect(accountLinksCreateMock).toHaveBeenCalledTimes(2);
    expect(accountsCreateMock).toHaveBeenCalledWith(expect.objectContaining({ type: "express" }), {
      idempotencyKey: "theraply:connect-account:v1:therapist-profile-id",
    });
    expect(accountLinksCreateMock.mock.calls.every(([params]) => params.account === "acct_new_mock")).toBe(true);
  });

  it("uses one provider idempotency identity for concurrent first actions", async () => {
    const providerAccounts = new Map<string, { id: string; charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean }>();
    therapistProfileFindFirstMock.mockResolvedValue(buildProfile(null));
    accountsCreateMock.mockImplementation(async (_params: unknown, options: { idempotencyKey: string }) => {
      if (!providerAccounts.has(options.idempotencyKey)) {
        providerAccounts.set(options.idempotencyKey, { id: "acct_one_mock", charges_enabled: false, payouts_enabled: false, details_submitted: false });
      }
      return providerAccounts.get(options.idempotencyKey);
    });
    const results = await Promise.all([
      createTherapistStripeAccountLink("therapist-user-id"),
      createTherapistStripeAccountLink("therapist-user-id"),
    ]);
    expect(providerAccounts.size).toBe(1);
    expect(new Set(results.map(result => result.stripeAccountId)).size).toBe(1);
    expect(accountsCreateMock.mock.calls.every(([, options]) => options.idempotencyKey === "theraply:connect-account:v1:therapist-profile-id")).toBe(true);
  });

  it("keeps the same provider key when retrying after a failed DB save", async () => {
    therapistProfileFindFirstMock.mockResolvedValue(buildProfile(null));
    therapistProfileUpdateMock.mockRejectedValueOnce(new Error("Mock DB save failure"));
    await expect(createTherapistStripeAccountLink("therapist-user-id")).rejects.toMatchObject({ code: "ACCOUNT_CREATE_FAILED" });
    await createTherapistStripeAccountLink("therapist-user-id");
    expect(accountsCreateMock).toHaveBeenCalledTimes(2);
    expect(accountsCreateMock.mock.calls[0][1]).toEqual(accountsCreateMock.mock.calls[1][1]);
    expect(accountLinksCreateMock).toHaveBeenCalledTimes(1);
  });
});
