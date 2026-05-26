import { describe, expect, it } from "vitest";

import { sanitizeDiagnosticMetadata } from "@/server/services/monitoring.service";

describe("monitoring redaction", () => {
  it("redacts a Wix API token embedded in diagnostic text", () => {
    const metadata = sanitizeDiagnosticMetadata({
      error: "Wix response included IST.header.payloadsignature0123456789",
    });

    expect(metadata.error).toBe("Wix response included [REDACTED]");
  });
});
