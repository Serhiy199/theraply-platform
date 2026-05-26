import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSignedCertificateUploadParameters } from "@/server/services/cloudinary-certificate-storage.provider";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("createSignedCertificateUploadParameters", () => {
  it("signs the therapist-specific folder without returning the Cloudinary secret", () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test-cloud");
    vi.stubEnv("CLOUDINARY_API_KEY", "public-key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "private-secret");
    vi.stubEnv("CLOUDINARY_CERTIFICATES_FOLDER", "theraply/therapist-certificates/");
    vi.spyOn(Date, "now").mockReturnValue(1_779_832_800_000);

    const result = createSignedCertificateUploadParameters("profile-id");
    const expectedSignature = createHash("sha1")
      .update(
        "folder=theraply/therapist-certificates/profile-id&timestamp=1779832800private-secret",
      )
      .digest("hex");

    expect(result).toEqual({
      cloudName: "test-cloud",
      apiKey: "public-key",
      timestamp: 1_779_832_800,
      signature: expectedSignature,
      folder: "theraply/therapist-certificates/profile-id",
      uploadUrl: "https://api.cloudinary.com/v1_1/test-cloud/auto/upload",
    });
    expect(JSON.stringify(result)).not.toContain("private-secret");
  });
});
