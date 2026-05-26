import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSignedCertificateUploadParameters,
  verifyUploadedCertificateAsset,
} from "@/server/services/cloudinary-certificate-storage.provider";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("createSignedCertificateUploadParameters", () => {
  it("signs a therapist-specific public ID without returning the Cloudinary secret", () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test-cloud");
    vi.stubEnv("CLOUDINARY_API_KEY", "public-key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "private-secret");
    vi.stubEnv("CLOUDINARY_CERTIFICATES_FOLDER", "theraply/therapist-certificates/");
    vi.spyOn(Date, "now").mockReturnValue(1_779_832_800_000);

    const result = createSignedCertificateUploadParameters("profile-id");
    const expectedSignature = createHash("sha1")
      .update(
        `public_id=${result.publicId}&timestamp=1779832800private-secret`,
      )
      .digest("hex");

    expect(result).toMatchObject({
      cloudName: "test-cloud",
      apiKey: "public-key",
      timestamp: 1_779_832_800,
      signature: expectedSignature,
      uploadUrl: "https://api.cloudinary.com/v1_1/test-cloud/auto/upload",
    });
    expect(result.publicId).toMatch(/^theraply\/therapist-certificates\/profile-id\/[0-9a-f-]+$/);
    expect(JSON.stringify(result)).not.toContain("private-secret");
  });
});

describe("verifyUploadedCertificateAsset", () => {
  function setupConfig() {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test-cloud");
    vi.stubEnv("CLOUDINARY_API_KEY", "public-key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "private-secret");
    vi.stubEnv("CLOUDINARY_CERTIFICATES_FOLDER", "theraply/therapist-certificates");
  }

  function buildConfirmation(publicId = "theraply/therapist-certificates/profile-id/asset-id") {
    const version = 1_779_832_800;
    const signature = createHash("sha1")
      .update(`public_id=${publicId}&version=${version}private-secret`)
      .digest("hex");

    return {
      publicId,
      version,
      signature,
      resourceType: "image" as const,
    };
  }

  it("reads trusted asset metadata from Cloudinary after response signature verification", async () => {
    setupConfig();
    const confirmation = buildConfirmation();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          public_id: confirmation.publicId,
          secure_url: "https://res.cloudinary.com/test-cloud/image/upload/asset-id.jpg",
          bytes: 6_000_000,
          version: confirmation.version,
          resource_type: "image",
          type: "upload",
          format: "jpg",
        }),
        { status: 200 },
      ),
    );

    const result = await verifyUploadedCertificateAsset("profile-id", confirmation);

    expect(result).toEqual({
      fileUrl: "https://res.cloudinary.com/test-cloud/image/upload/asset-id.jpg",
      publicId: confirmation.publicId,
      size: 6_000_000,
      resourceType: "image",
      format: "jpg",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/resources/image/upload/"),
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Basic ${Buffer.from("public-key:private-secret").toString("base64")}`,
        },
      }),
    );
  });

  it("rejects assets outside the therapist-specific folder before calling Cloudinary", async () => {
    setupConfig();
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      verifyUploadedCertificateAsset("profile-id", buildConfirmation("theraply/therapist-certificates/other-profile/file")),
    ).rejects.toMatchObject({
      name: "CloudinaryCertificateAssetVerificationError",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a forged upload response signature before calling Cloudinary", async () => {
    setupConfig();
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      verifyUploadedCertificateAsset("profile-id", {
        ...buildConfirmation(),
        signature: "0".repeat(40),
      }),
    ).rejects.toMatchObject({
      name: "CloudinaryCertificateAssetVerificationError",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
