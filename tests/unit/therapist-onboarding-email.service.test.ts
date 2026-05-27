import { afterEach, describe, expect, it, vi } from "vitest";

import { EMAIL_TEMPLATES } from "@/lib/constants/auth";
import { sendTherapistOnboardingChangesRequestedEmail } from "@/server/services/therapist-onboarding-email.service";

const sendTransactionalEmailMock = vi.hoisted(() => vi.fn());
const logDiagnosticEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/email-delivery.service", () => ({
  sendTransactionalEmail: sendTransactionalEmailMock,
}));

vi.mock("@/server/services/audit-log.service", () => ({
  logDiagnosticEvent: logDiagnosticEventMock,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("sendTherapistOnboardingChangesRequestedEmail", () => {
  it("sends an English update request email containing admin feedback", async () => {
    vi.stubEnv("APP_URL", "https://theraply.example");
    sendTransactionalEmailMock.mockResolvedValue({});

    await sendTherapistOnboardingChangesRequestedEmail({
      userId: "therapist-user-id",
      email: "therapist@example.com",
      firstName: "Alex",
      displayName: "Alex Therapist",
      changesRequestedMessage: "Please upload a clearer certificate photo.",
    });

    expect(sendTransactionalEmailMock).toHaveBeenCalledWith({
      userId: "therapist-user-id",
      email: "therapist@example.com",
      template: EMAIL_TEMPLATES.therapistOnboardingChangesRequested,
      subject: "Your therapist profile needs updates",
      text: expect.stringContaining("Please upload a clearer certificate photo."),
      actionUrl: "https://theraply.example/therapist/onboarding",
    });
  });

  it("keeps delivery failures non-blocking and records diagnostics", async () => {
    sendTransactionalEmailMock.mockRejectedValue(new Error("SMTP unavailable"));

    await expect(
      sendTherapistOnboardingChangesRequestedEmail({
        userId: "therapist-user-id",
        email: "therapist@example.com",
        changesRequestedMessage: "Please upload a clearer certificate photo.",
      }),
    ).resolves.toBeUndefined();

    expect(logDiagnosticEventMock).toHaveBeenCalledWith(
      "therapist-onboarding-email",
      "Delivery failed.",
      expect.objectContaining({
        template: EMAIL_TEMPLATES.therapistOnboardingChangesRequested,
      }),
    );
  });
});
