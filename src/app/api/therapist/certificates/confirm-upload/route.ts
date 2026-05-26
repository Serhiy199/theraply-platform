import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { RATE_LIMIT_PRESETS } from "@/lib/constants/rate-limit";
import { SAFE_ERROR_MESSAGES, getSafeCertificateStorageErrorMessage } from "@/lib/errors/safe-error-messages";
import { ActionPermissionError, requireCurrentActionRole } from "@/lib/permissions";
import { certificateUploadConfirmationSchema } from "@/lib/validations/certificate-upload";
import {
  CertificateStorageServiceError,
  assertTherapistCanUploadCertificate,
  createTherapistCertificateFromCloudinaryUpload,
} from "@/server/services/certificate-storage.service";
import {
  CloudinaryCertificateAssetVerificationError,
  CloudinaryCertificateStorageConfigError,
  verifyUploadedCertificateAsset,
} from "@/server/services/cloudinary-certificate-storage.provider";
import {
  createAuditLogEntryBestEffort,
  logDiagnosticEvent,
} from "@/server/services/audit-log.service";
import {
  buildUserRateLimitIdentifier,
  checkRateLimitPreset,
  getRateLimitHeaders,
} from "@/server/services/rate-limit.service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ success: false, error: "Authentication is required." }, { status: 401 });
  }

  let user: Awaited<ReturnType<typeof requireCurrentActionRole>>;

  try {
    user = await requireCurrentActionRole(
      currentUser,
      [UserRole.THERAPIST],
      "Only therapist accounts can confirm certificate uploads.",
    );
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return NextResponse.json({ success: false, error: SAFE_ERROR_MESSAGES.permissionDenied }, { status: 403 });
    }

    throw error;
  }

  const rateLimit = await checkRateLimitPreset(
    RATE_LIMIT_PRESETS.therapistCertificateConfirmUpload,
    buildUserRateLimitIdentifier({ userId: user.id }),
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: AUTH_MESSAGES.rateLimited },
      { status: 429, headers: getRateLimitHeaders(rateLimit) },
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400, headers: getRateLimitHeaders(rateLimit) },
    );
  }

  const parsed = certificateUploadConfirmationSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: getSafeCertificateStorageErrorMessage("THERAPIST_CERTIFICATE_METADATA_INVALID") },
      { status: 400, headers: getRateLimitHeaders(rateLimit) },
    );
  }

  try {
    const profile = await assertTherapistCanUploadCertificate(user.id);
    const verifiedAsset = await verifyUploadedCertificateAsset(profile.id, {
      publicId: parsed.data.publicId,
      version: parsed.data.version,
      signature: parsed.data.signature,
      resourceType: parsed.data.resourceType,
    });
    const certificate = await createTherapistCertificateFromCloudinaryUpload(user.id, {
      fileName: parsed.data.fileName,
      fileUrl: verifiedAsset.fileUrl,
      publicId: verifiedAsset.publicId,
      storageProvider: "cloudinary",
      mimeType: parsed.data.mimeType,
      size: verifiedAsset.size,
    });

    await createAuditLogEntryBestEffort({
      actorUserId: user.id,
      entityType: "TherapistCertificate",
      entityId: certificate.id,
      action: "THERAPIST_CERTIFICATE_UPLOAD_CONFIRMED",
      after: {
        therapistProfileId: profile.id,
        publicId: certificate.publicId,
        size: certificate.size,
        mimeType: certificate.mimeType,
      },
    });

    return NextResponse.json(
      { success: true, certificate },
      { status: 201, headers: getRateLimitHeaders(rateLimit) },
    );
  } catch (error) {
    if (error instanceof CertificateStorageServiceError) {
      const status = error.code === "THERAPIST_PROFILE_NOT_FOUND" ? 404 : 409;

      return NextResponse.json(
        { success: false, error: getSafeCertificateStorageErrorMessage(error.code) },
        { status, headers: getRateLimitHeaders(rateLimit) },
      );
    }

    logDiagnosticEvent(
      "certificate-confirm-upload-route",
      "Unable to confirm a Cloudinary certificate upload.",
      {
        therapistUserId: user.id,
        publicId: parsed.data.publicId,
        error,
      },
    );

    if (error instanceof CloudinaryCertificateStorageConfigError) {
      return NextResponse.json(
        { success: false, error: getSafeCertificateStorageErrorMessage("THERAPIST_CERTIFICATE_STORAGE_NOT_CONFIGURED") },
        { status: 503, headers: getRateLimitHeaders(rateLimit) },
      );
    }

    if (error instanceof CloudinaryCertificateAssetVerificationError) {
      return NextResponse.json(
        { success: false, error: getSafeCertificateStorageErrorMessage("THERAPIST_CERTIFICATE_ASSET_VERIFICATION_FAILED") },
        { status: 409, headers: getRateLimitHeaders(rateLimit) },
      );
    }

    return NextResponse.json(
      { success: false, error: "Something went wrong while confirming certificate upload." },
      { status: 500, headers: getRateLimitHeaders(rateLimit) },
    );
  }
}
