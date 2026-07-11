import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { RATE_LIMIT_PRESETS } from "@/lib/constants/rate-limit";
import {
  THERAPIST_PROFILE_PHOTO_ALLOWED_FORMATS,
  THERAPIST_PROFILE_PHOTO_MAX_FILE_SIZE_BYTES,
} from "@/lib/constants/therapist-profile-photo";
import {
  SAFE_ERROR_MESSAGES,
  getSafeTherapistProfilePhotoErrorMessage,
} from "@/lib/errors/safe-error-messages";
import { ActionPermissionError, requireCurrentActionRole } from "@/lib/permissions";
import {
  buildUserRateLimitIdentifier,
  checkRateLimitPreset,
  getRateLimitHeaders,
} from "@/server/services/rate-limit.service";
import { logDiagnosticEvent } from "@/server/services/audit-log.service";
import {
  CloudinaryProfilePhotoStorageConfigError,
  createSignedProfilePhotoUploadParameters,
} from "@/server/services/cloudinary-profile-photo-storage.provider";
import {
  TherapistProfilePhotoServiceError,
  getTherapistProfileForPhotoUpload,
} from "@/server/services/therapist-profile-photo.service";

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
      "Only therapist accounts can request profile photo upload signatures.",
    );
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return NextResponse.json({ success: false, error: SAFE_ERROR_MESSAGES.permissionDenied }, { status: 403 });
    }

    throw error;
  }

  const rateLimit = await checkRateLimitPreset(
    RATE_LIMIT_PRESETS.therapistProfilePhotoUpload,
    buildUserRateLimitIdentifier({ userId: user.id }),
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: AUTH_MESSAGES.rateLimited },
      { status: 429, headers: getRateLimitHeaders(rateLimit) },
    );
  }

  try {
    const profile = await getTherapistProfileForPhotoUpload(user.id);
    const signedUpload = createSignedProfilePhotoUploadParameters(profile.id);

    return NextResponse.json(
      {
        success: true,
        upload: {
          ...signedUpload,
          maxFileSize: THERAPIST_PROFILE_PHOTO_MAX_FILE_SIZE_BYTES,
          acceptedFormats: THERAPIST_PROFILE_PHOTO_ALLOWED_FORMATS,
        },
      },
      { status: 200, headers: getRateLimitHeaders(rateLimit) },
    );
  } catch (error) {
    if (error instanceof TherapistProfilePhotoServiceError) {
      const status = error.code === "THERAPIST_PROFILE_NOT_FOUND" ? 404 : 409;

      return NextResponse.json(
        { success: false, error: getSafeTherapistProfilePhotoErrorMessage(error.code) },
        { status, headers: getRateLimitHeaders(rateLimit) },
      );
    }

    logDiagnosticEvent(
      "profile-photo-upload-signature-route",
      "Unable to create a Cloudinary profile photo upload signature.",
      {
        therapistUserId: user.id,
        error,
      },
    );

    if (error instanceof CloudinaryProfilePhotoStorageConfigError) {
      return NextResponse.json(
        {
          success: false,
          error: getSafeTherapistProfilePhotoErrorMessage(
            "THERAPIST_PROFILE_PHOTO_STORAGE_NOT_CONFIGURED",
          ),
        },
        { status: 503, headers: getRateLimitHeaders(rateLimit) },
      );
    }

    return NextResponse.json(
      { success: false, error: "Something went wrong while preparing profile photo upload." },
      { status: 500, headers: getRateLimitHeaders(rateLimit) },
    );
  }
}
