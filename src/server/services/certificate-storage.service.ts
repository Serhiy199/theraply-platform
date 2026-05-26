import "server-only";

import { TherapistApprovalStatus } from "@prisma/client";
import {
  CERTIFICATE_FILE_TOO_LARGE_MESSAGE,
  CERTIFICATE_MAX_FILE_SIZE_BYTES,
} from "@/lib/constants/certificate-upload";
import { prisma } from "@/lib/prisma";
import { canEditTherapistOnboardingDraft } from "@/lib/therapist-lifecycle";

const CERTIFICATE_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const CERTIFICATE_ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "pdf",
  "doc",
  "docx",
  "txt",
]);

export type TherapistCertificateCloudinaryUploadMetadata = {
  fileName: string;
  fileUrl: string;
  publicId: string;
  storageProvider: "cloudinary";
  mimeType: string;
  size: number;
};

export class CertificateStorageServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "THERAPIST_PROFILE_NOT_FOUND"
      | "THERAPIST_CERTIFICATE_UPLOAD_LOCKED"
      | "THERAPIST_CERTIFICATE_FILE_REQUIRED"
      | "THERAPIST_CERTIFICATE_FILE_TOO_LARGE"
      | "THERAPIST_CERTIFICATE_FILE_TYPE_UNSUPPORTED"
      | "THERAPIST_CERTIFICATE_METADATA_INVALID",
  ) {
    super(message);
    this.name = "CertificateStorageServiceError";
  }
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.trim().toLowerCase();

  return extension || null;
}

function validateCertificateMetadata(
  input: TherapistCertificateCloudinaryUploadMetadata,
) {
  if (
    !input.fileName.trim() ||
    !input.publicId.trim() ||
    input.storageProvider !== "cloudinary"
  ) {
    throw new CertificateStorageServiceError(
      "Certificate upload metadata is invalid.",
      "THERAPIST_CERTIFICATE_METADATA_INVALID",
    );
  }

  try {
    const fileUrl = new URL(input.fileUrl);

    if (fileUrl.protocol !== "https:") {
      throw new Error("Invalid certificate URL protocol.");
    }
  } catch {
    throw new CertificateStorageServiceError(
      "Certificate upload metadata is invalid.",
      "THERAPIST_CERTIFICATE_METADATA_INVALID",
    );
  }

  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new CertificateStorageServiceError(
      "Choose at least one certificate file to upload.",
      "THERAPIST_CERTIFICATE_FILE_REQUIRED",
    );
  }

  if (input.size > CERTIFICATE_MAX_FILE_SIZE_BYTES) {
    throw new CertificateStorageServiceError(
      CERTIFICATE_FILE_TOO_LARGE_MESSAGE,
      "THERAPIST_CERTIFICATE_FILE_TOO_LARGE",
    );
  }

  const extension = getFileExtension(input.fileName);
  const isAllowedMime = CERTIFICATE_ALLOWED_MIME_TYPES.has(input.mimeType);
  const isAllowedExtension = extension ? CERTIFICATE_ALLOWED_EXTENSIONS.has(extension) : false;

  if (!isAllowedMime || !isAllowedExtension) {
    throw new CertificateStorageServiceError(
      "Certificate files must be JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX, or TXT.",
      "THERAPIST_CERTIFICATE_FILE_TYPE_UNSUPPORTED",
    );
  }
}

export async function assertTherapistCanUploadCertificate(userId: string) {
  const profile = await prisma.therapistProfile.findUnique({
    where: {
      userId,
    },
    select: {
      id: true,
      approvalStatus: true,
    },
  });

  if (!profile) {
    throw new CertificateStorageServiceError(
      "Therapist profile not found for this account.",
      "THERAPIST_PROFILE_NOT_FOUND",
    );
  }

  if (
    profile.approvalStatus === TherapistApprovalStatus.EMAIL_NOT_VERIFIED ||
    !canEditTherapistOnboardingDraft(profile.approvalStatus)
  ) {
    throw new CertificateStorageServiceError(
      "Certificate files can only be uploaded while the onboarding form is editable.",
      "THERAPIST_CERTIFICATE_UPLOAD_LOCKED",
    );
  }

  return profile;
}

async function createTherapistCertificateRecord(
  therapistProfileId: string,
  input: TherapistCertificateCloudinaryUploadMetadata,
) {
  validateCertificateMetadata(input);

  return prisma.therapistCertificate.create({
    data: {
      therapistProfileId,
      fileName: input.fileName,
      fileUrl: input.fileUrl,
      publicId: input.publicId,
      storageProvider: input.storageProvider,
      mimeType: input.mimeType,
      size: input.size,
      uploadedAt: new Date(),
    },
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
      publicId: true,
      storageProvider: true,
      mimeType: true,
      size: true,
      uploadedAt: true,
    },
  });
}

export async function createTherapistCertificateFromCloudinaryUpload(
  userId: string,
  input: TherapistCertificateCloudinaryUploadMetadata,
) {
  const profile = await assertTherapistCanUploadCertificate(userId);

  return createTherapistCertificateRecord(profile.id, input);
}
