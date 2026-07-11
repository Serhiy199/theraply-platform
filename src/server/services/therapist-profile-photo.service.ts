import "server-only";

import {
  THERAPIST_PROFILE_PHOTO_ALLOWED_MIME_TYPES,
  THERAPIST_PROFILE_PHOTO_FILE_TOO_LARGE_MESSAGE,
  THERAPIST_PROFILE_PHOTO_MAX_FILE_SIZE_BYTES,
} from "@/lib/constants/therapist-profile-photo";
import { prisma } from "@/lib/prisma";
import { createAuditLogEntryBestEffort } from "@/server/services/audit-log.service";

const PROFILE_PHOTO_ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const PROFILE_PHOTO_ALLOWED_MIME_TYPES = new Set<string>(
  THERAPIST_PROFILE_PHOTO_ALLOWED_MIME_TYPES,
);

export type TherapistProfilePhotoCloudinaryUploadMetadata = {
  fileName: string;
  fileUrl: string;
  publicId: string;
  mimeType: string;
  size: number;
};

export class TherapistProfilePhotoServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "THERAPIST_PROFILE_NOT_FOUND"
      | "THERAPIST_PROFILE_PHOTO_FILE_REQUIRED"
      | "THERAPIST_PROFILE_PHOTO_FILE_TOO_LARGE"
      | "THERAPIST_PROFILE_PHOTO_FILE_TYPE_UNSUPPORTED"
      | "THERAPIST_PROFILE_PHOTO_METADATA_INVALID",
  ) {
    super(message);
    this.name = "TherapistProfilePhotoServiceError";
  }
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.trim().toLowerCase();

  return extension || null;
}

function validateProfilePhotoMetadata(
  input: TherapistProfilePhotoCloudinaryUploadMetadata,
) {
  if (!input.fileName.trim() || !input.publicId.trim()) {
    throw new TherapistProfilePhotoServiceError(
      "Profile photo upload metadata is invalid.",
      "THERAPIST_PROFILE_PHOTO_METADATA_INVALID",
    );
  }

  try {
    const fileUrl = new URL(input.fileUrl);

    if (fileUrl.protocol !== "https:") {
      throw new Error("Invalid profile photo URL protocol.");
    }
  } catch {
    throw new TherapistProfilePhotoServiceError(
      "Profile photo upload metadata is invalid.",
      "THERAPIST_PROFILE_PHOTO_METADATA_INVALID",
    );
  }

  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new TherapistProfilePhotoServiceError(
      "Choose a profile photo to upload.",
      "THERAPIST_PROFILE_PHOTO_FILE_REQUIRED",
    );
  }

  if (input.size > THERAPIST_PROFILE_PHOTO_MAX_FILE_SIZE_BYTES) {
    throw new TherapistProfilePhotoServiceError(
      THERAPIST_PROFILE_PHOTO_FILE_TOO_LARGE_MESSAGE,
      "THERAPIST_PROFILE_PHOTO_FILE_TOO_LARGE",
    );
  }

  const extension = getFileExtension(input.fileName);
  const isAllowedMime = PROFILE_PHOTO_ALLOWED_MIME_TYPES.has(input.mimeType);
  const isAllowedExtension = extension ? PROFILE_PHOTO_ALLOWED_EXTENSIONS.has(extension) : false;

  if (!isAllowedMime || !isAllowedExtension) {
    throw new TherapistProfilePhotoServiceError(
      "Profile photo must be JPG, JPEG, PNG, or WEBP.",
      "THERAPIST_PROFILE_PHOTO_FILE_TYPE_UNSUPPORTED",
    );
  }
}

export async function getTherapistProfileForPhotoUpload(userId: string) {
  const profile = await prisma.therapistProfile.findUnique({
    where: {
      userId,
    },
    select: {
      id: true,
      profilePhotoUrl: true,
      profilePhotoPublicId: true,
    },
  });

  if (!profile) {
    throw new TherapistProfilePhotoServiceError(
      "Therapist profile not found for this account.",
      "THERAPIST_PROFILE_NOT_FOUND",
    );
  }

  return profile;
}

export async function updateTherapistProfilePhotoFromCloudinaryUpload(
  userId: string,
  input: TherapistProfilePhotoCloudinaryUploadMetadata,
) {
  validateProfilePhotoMetadata(input);

  const profile = await getTherapistProfileForPhotoUpload(userId);
  const updatedProfile = await prisma.therapistProfile.update({
    where: {
      id: profile.id,
    },
    data: {
      profilePhotoUrl: input.fileUrl,
      profilePhotoPublicId: input.publicId,
      profilePhotoUploadedAt: new Date(),
    },
    select: {
      id: true,
      profilePhotoUrl: true,
      profilePhotoPublicId: true,
      profilePhotoUploadedAt: true,
    },
  });

  await createAuditLogEntryBestEffort({
    actorUserId: userId,
    entityType: "TherapistProfile",
    entityId: profile.id,
    action: "THERAPIST_PROFILE_PHOTO_UPDATED",
    before: {
      profilePhotoPublicId: profile.profilePhotoPublicId,
      hasProfilePhoto: Boolean(profile.profilePhotoUrl),
    },
    after: {
      profilePhotoPublicId: updatedProfile.profilePhotoPublicId,
      hasProfilePhoto: Boolean(updatedProfile.profilePhotoUrl),
    },
  });

  return updatedProfile;
}
