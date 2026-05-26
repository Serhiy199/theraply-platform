import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_MESSAGES } from "@/lib/constants/auth";
import {
  CERTIFICATE_ALLOWED_FORMATS,
  CERTIFICATE_MAX_FILE_SIZE_BYTES,
} from "@/lib/constants/certificate-upload";
import { SAFE_ERROR_MESSAGES, getSafeCertificateStorageErrorMessage } from "@/lib/errors/safe-error-messages";
import { ActionPermissionError, requireCurrentActionRole } from "@/lib/permissions";
import {
  CertificateStorageServiceError,
  assertTherapistCanUploadCertificate,
} from "@/server/services/certificate-storage.service";
import {
  CloudinaryCertificateStorageConfigError,
  createSignedCertificateUploadParameters,
} from "@/server/services/cloudinary-certificate-storage.provider";
import { logDiagnosticEvent } from "@/server/services/audit-log.service";
import {
  buildUserRateLimitIdentifier,
  checkRateLimitPreset,
  getRateLimitHeaders,
} from "@/server/services/rate-limit.service";
import { RATE_LIMIT_PRESETS } from "@/lib/constants/rate-limit";

export const runtime = "nodejs";

export async function POST() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ success: false, error: "Authentication is required." }, { status: 401 });
  }

  let user: Awaited<ReturnType<typeof requireCurrentActionRole>>;

  try {
    user = await requireCurrentActionRole(
      currentUser,
      [UserRole.THERAPIST],
      "Only therapist accounts can request certificate upload signatures.",
    );
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return NextResponse.json({ success: false, error: SAFE_ERROR_MESSAGES.permissionDenied }, { status: 403 });
    }

    throw error;
  }

  const rateLimit = await checkRateLimitPreset(
    RATE_LIMIT_PRESETS.therapistCertificateUpload,
    buildUserRateLimitIdentifier({ userId: user.id }),
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: AUTH_MESSAGES.rateLimited },
      { status: 429, headers: getRateLimitHeaders(rateLimit) },
    );
  }

  try {
    const profile = await assertTherapistCanUploadCertificate(user.id);
    const signedUpload = createSignedCertificateUploadParameters(profile.id);

    return NextResponse.json(
      {
        success: true,
        upload: {
          ...signedUpload,
          maxFileSize: CERTIFICATE_MAX_FILE_SIZE_BYTES,
          allowedFormats: CERTIFICATE_ALLOWED_FORMATS,
        },
      },
      { status: 200, headers: getRateLimitHeaders(rateLimit) },
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
      "certificate-upload-signature-route",
      "Unable to create a Cloudinary certificate upload signature.",
      {
        therapistUserId: user.id,
        error,
      },
    );

    if (error instanceof CloudinaryCertificateStorageConfigError) {
      return NextResponse.json(
        {
          success: false,
          error: getSafeCertificateStorageErrorMessage(
            "THERAPIST_CERTIFICATE_STORAGE_NOT_CONFIGURED",
          ),
        },
        { status: 503, headers: getRateLimitHeaders(rateLimit) },
      );
    }

    return NextResponse.json(
      { success: false, error: "Something went wrong while preparing certificate upload." },
      { status: 500, headers: getRateLimitHeaders(rateLimit) },
    );
  }
}
