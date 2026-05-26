import { describe, expect, it } from "vitest";

import {
  SAFE_ERROR_MESSAGES,
  getSafeBookingFlowErrorMessage,
  getSafeCertificateStorageErrorMessage,
  getSafePaymentFlowErrorMessage,
} from "@/lib/errors/safe-error-messages";

describe("safe error messages", () => {
  it("keeps unknown booking errors on a generic user-safe message", () => {
    expect(getSafeBookingFlowErrorMessage("RAW_PRISMA_STACK")).toBe(
      SAFE_ERROR_MESSAGES.genericBooking,
    );
  });

  it("keeps unknown payment errors on a generic user-safe message", () => {
    expect(getSafePaymentFlowErrorMessage("STRIPE_SECRET_LEAK")).toBe(
      SAFE_ERROR_MESSAGES.genericPayment,
    );
  });

  it("returns a specific safe certificate upload validation message", () => {
    expect(getSafeCertificateStorageErrorMessage("THERAPIST_CERTIFICATE_FILE_TOO_LARGE")).toBe(
      "Certificate files must be 10MB or smaller.",
    );
    expect(
      getSafeCertificateStorageErrorMessage("THERAPIST_CERTIFICATE_SERVER_ACTION_FILE_TOO_LARGE"),
    ).toBe(
      "Certificate files uploaded through this form must be 4MB or smaller.",
    );
  });
});
