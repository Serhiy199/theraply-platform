import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActionPermissionError } from "@/lib/permissions";
import { CertificateStorageServiceError } from "@/server/services/certificate-storage.service";
import { CloudinaryCertificateStorageConfigError } from "@/server/services/cloudinary-certificate-storage.provider";
import { POST } from "@/app/api/therapist/certificates/upload-signature/route";

const getCurrentUserMock = vi.hoisted(() => vi.fn());
const requireCurrentActionRoleMock = vi.hoisted(() => vi.fn());
const assertCanUploadMock = vi.hoisted(() => vi.fn());
const createSignedUploadMock = vi.hoisted(() => vi.fn());
const checkRateLimitPresetMock = vi.hoisted(() => vi.fn());
const logDiagnosticEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions")>();

  return {
    ...actual,
    requireCurrentActionRole: requireCurrentActionRoleMock,
  };
});

vi.mock("@/server/services/certificate-storage.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/certificate-storage.service")>();

  return {
    ...actual,
    assertTherapistCanUploadCertificate: assertCanUploadMock,
  };
});

vi.mock("@/server/services/cloudinary-certificate-storage.provider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/services/cloudinary-certificate-storage.provider")>();

  return {
    ...actual,
    createSignedCertificateUploadParameters: createSignedUploadMock,
  };
});

vi.mock("@/server/services/rate-limit.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/rate-limit.service")>();

  return {
    ...actual,
    checkRateLimitPreset: checkRateLimitPresetMock,
  };
});

vi.mock("@/server/services/audit-log.service", () => ({
  logDiagnosticEvent: logDiagnosticEventMock,
}));

const therapistUser = {
  id: "therapist-user-id",
  email: "therapist@example.com",
  role: "THERAPIST",
};

const allowedRateLimit = {
  allowed: true,
  limit: 10,
  remaining: 9,
  resetAt: new Date("2026-05-27T00:00:00.000Z"),
  retryAfterSeconds: 0,
};

beforeEach(() => {
  getCurrentUserMock.mockResolvedValue(therapistUser);
  requireCurrentActionRoleMock.mockResolvedValue(therapistUser);
  checkRateLimitPresetMock.mockResolvedValue(allowedRateLimit);
  assertCanUploadMock.mockResolvedValue({
    id: "therapist-profile-id",
    approvalStatus: "PROFILE_INCOMPLETE",
  });
  createSignedUploadMock.mockReturnValue({
    cloudName: "cloud-name",
    apiKey: "public-api-key",
    timestamp: 1779832800,
    signature: "signed-value",
    folder: "theraply/therapist-certificates/therapist-profile-id",
    uploadUrl: "https://api.cloudinary.com/v1_1/cloud-name/auto/upload",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/therapist/certificates/upload-signature", () => {
  it("rejects unauthenticated requests", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(401);
    expect(requireCurrentActionRoleMock).not.toHaveBeenCalled();
    expect(createSignedUploadMock).not.toHaveBeenCalled();
  });

  it("rejects authenticated accounts that are not therapists", async () => {
    requireCurrentActionRoleMock.mockRejectedValue(new ActionPermissionError());

    const response = await POST();

    expect(response.status).toBe(403);
    expect(createSignedUploadMock).not.toHaveBeenCalled();
  });

  it("returns a scoped signed upload contract without exposing an API secret", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(assertCanUploadMock).toHaveBeenCalledWith("therapist-user-id");
    expect(createSignedUploadMock).toHaveBeenCalledWith("therapist-profile-id");
    expect(body).toMatchObject({
      success: true,
      upload: {
        cloudName: "cloud-name",
        apiKey: "public-api-key",
        signature: "signed-value",
        folder: "theraply/therapist-certificates/therapist-profile-id",
        maxFileSize: 10 * 1024 * 1024,
        allowedFormats: ["jpg", "jpeg", "png", "webp", "pdf", "doc", "docx", "txt"],
      },
    });
    expect(JSON.stringify(body)).not.toContain("CLOUDINARY_API_SECRET");
    expect(JSON.stringify(body)).not.toContain("private-secret");
  });

  it("rate-limits repeated signature requests", async () => {
    checkRateLimitPresetMock.mockResolvedValue({
      ...allowedRateLimit,
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 300,
    });

    const response = await POST();

    expect(response.status).toBe(429);
    expect(assertCanUploadMock).not.toHaveBeenCalled();
    expect(createSignedUploadMock).not.toHaveBeenCalled();
  });

  it("rejects uploads when onboarding can no longer be edited", async () => {
    assertCanUploadMock.mockRejectedValue(
      new CertificateStorageServiceError(
        "Certificate files can only be uploaded while the onboarding form is editable.",
        "THERAPIST_CERTIFICATE_UPLOAD_LOCKED",
      ),
    );

    const response = await POST();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "Certificates can only be uploaded while onboarding is editable.",
    });
    expect(createSignedUploadMock).not.toHaveBeenCalled();
  });

  it("returns a controlled response when Cloudinary is not configured", async () => {
    createSignedUploadMock.mockImplementation(() => {
      throw new CloudinaryCertificateStorageConfigError();
    });

    const response = await POST();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "Certificate upload is not configured yet.",
    });
    expect(logDiagnosticEventMock).toHaveBeenCalled();
  });
});
