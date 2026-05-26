import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActionPermissionError } from "@/lib/permissions";
import { CloudinaryCertificateAssetVerificationError } from "@/server/services/cloudinary-certificate-storage.provider";
import { POST } from "@/app/api/therapist/certificates/confirm-upload/route";

const getCurrentUserMock = vi.hoisted(() => vi.fn());
const requireCurrentActionRoleMock = vi.hoisted(() => vi.fn());
const assertCanUploadMock = vi.hoisted(() => vi.fn());
const persistCertificateMock = vi.hoisted(() => vi.fn());
const verifyAssetMock = vi.hoisted(() => vi.fn());
const checkRateLimitPresetMock = vi.hoisted(() => vi.fn());
const createAuditLogMock = vi.hoisted(() => vi.fn());
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
    createTherapistCertificateFromCloudinaryUpload: persistCertificateMock,
  };
});

vi.mock("@/server/services/cloudinary-certificate-storage.provider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/services/cloudinary-certificate-storage.provider")>();

  return {
    ...actual,
    verifyUploadedCertificateAsset: verifyAssetMock,
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
  createAuditLogEntryBestEffort: createAuditLogMock,
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

const requestPayload = {
  fileName: "certificate.pdf",
  mimeType: "application/pdf",
  publicId: "theraply/therapist-certificates/profile-id/certificate.pdf",
  version: 1_779_832_800,
  signature: "a".repeat(40),
  resourceType: "raw",
};

function buildRequest(payload: unknown = requestPayload) {
  return new Request("http://localhost/api/therapist/certificates/confirm-upload", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  getCurrentUserMock.mockResolvedValue(therapistUser);
  requireCurrentActionRoleMock.mockResolvedValue(therapistUser);
  checkRateLimitPresetMock.mockResolvedValue(allowedRateLimit);
  assertCanUploadMock.mockResolvedValue({
    id: "profile-id",
    approvalStatus: "PROFILE_INCOMPLETE",
  });
  verifyAssetMock.mockResolvedValue({
    fileUrl: "https://res.cloudinary.com/cloud/raw/upload/certificate.pdf",
    publicId: requestPayload.publicId,
    size: 6_000_000,
    resourceType: "raw",
    format: "pdf",
  });
  persistCertificateMock.mockResolvedValue({
    id: "certificate-id",
    fileName: requestPayload.fileName,
    fileUrl: "https://res.cloudinary.com/cloud/raw/upload/certificate.pdf",
    publicId: requestPayload.publicId,
    storageProvider: "cloudinary",
    mimeType: requestPayload.mimeType,
    size: 6_000_000,
    uploadedAt: new Date("2026-05-26T20:00:00.000Z"),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/therapist/certificates/confirm-upload", () => {
  it("rejects unauthenticated requests", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await POST(buildRequest() as never);

    expect(response.status).toBe(401);
    expect(verifyAssetMock).not.toHaveBeenCalled();
  });

  it("rejects authenticated non-therapist accounts", async () => {
    requireCurrentActionRoleMock.mockRejectedValue(new ActionPermissionError());

    const response = await POST(buildRequest() as never);

    expect(response.status).toBe(403);
    expect(verifyAssetMock).not.toHaveBeenCalled();
  });

  it("validates confirmation input before verifying the asset", async () => {
    const response = await POST(buildRequest({ publicId: "" }) as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "Certificate upload details are invalid.",
    });
    expect(verifyAssetMock).not.toHaveBeenCalled();
  });

  it("persists only Cloudinary-verified URL and bytes", async () => {
    const response = await POST(buildRequest() as never);

    expect(response.status).toBe(201);
    expect(verifyAssetMock).toHaveBeenCalledWith("profile-id", {
      publicId: requestPayload.publicId,
      version: requestPayload.version,
      signature: requestPayload.signature,
      resourceType: requestPayload.resourceType,
    });
    expect(persistCertificateMock).toHaveBeenCalledWith("therapist-user-id", {
      fileName: "certificate.pdf",
      fileUrl: "https://res.cloudinary.com/cloud/raw/upload/certificate.pdf",
      publicId: requestPayload.publicId,
      storageProvider: "cloudinary",
      mimeType: "application/pdf",
      size: 6_000_000,
    });
    expect(createAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "THERAPIST_CERTIFICATE_UPLOAD_CONFIRMED",
        entityId: "certificate-id",
      }),
    );
  });

  it("does not persist a certificate when Cloudinary verification fails", async () => {
    verifyAssetMock.mockRejectedValue(new CloudinaryCertificateAssetVerificationError());

    const response = await POST(buildRequest() as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "Could not verify the uploaded certificate. Please try again.",
    });
    expect(persistCertificateMock).not.toHaveBeenCalled();
    expect(logDiagnosticEventMock).toHaveBeenCalled();
  });

  it("rate-limits repeated confirmation attempts", async () => {
    checkRateLimitPresetMock.mockResolvedValue({
      ...allowedRateLimit,
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 300,
    });

    const response = await POST(buildRequest() as never);

    expect(response.status).toBe(429);
    expect(verifyAssetMock).not.toHaveBeenCalled();
    expect(persistCertificateMock).not.toHaveBeenCalled();
  });
});
