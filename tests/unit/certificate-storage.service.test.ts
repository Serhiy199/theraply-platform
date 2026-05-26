import { TherapistApprovalStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CERTIFICATE_MAX_FILE_SIZE_BYTES,
  CERTIFICATE_SERVER_ACTION_MAX_FILE_SIZE_BYTES,
} from "@/lib/constants/certificate-upload";
import {
  assertTherapistCanUploadCertificate,
  createTherapistCertificateFromCloudinaryUpload,
  uploadTherapistCertificates,
} from "@/server/services/certificate-storage.service";

const findUniqueMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());
const isConfiguredMock = vi.hoisted(() => vi.fn());
const providerUploadMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    therapistProfile: {
      findUnique: findUniqueMock,
    },
    therapistCertificate: {
      create: createMock,
    },
  },
}));

vi.mock("@/server/services/cloudinary-certificate-storage.provider", () => ({
  isCloudinaryCertificateStorageConfigured: isConfiguredMock,
  uploadCertificateToCloudinary: providerUploadMock,
}));

const editableProfile = {
  id: "therapist-profile-id",
  approvalStatus: TherapistApprovalStatus.PROFILE_INCOMPLETE,
};

function buildMetadata(size = CERTIFICATE_MAX_FILE_SIZE_BYTES) {
  return {
    fileName: "qualification.pdf",
    fileUrl: "https://res.cloudinary.com/demo/raw/upload/qualification.pdf",
    publicId: "theraply/therapist-certificates/qualification",
    storageProvider: "cloudinary" as const,
    mimeType: "application/pdf",
    size,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("certificate storage service direct upload foundation", () => {
  it("allows certificate upload only while therapist onboarding is editable", async () => {
    findUniqueMock.mockResolvedValue(editableProfile);

    await expect(assertTherapistCanUploadCertificate("therapist-user-id")).resolves.toEqual(
      editableProfile,
    );

    findUniqueMock.mockResolvedValue({
      ...editableProfile,
      approvalStatus: TherapistApprovalStatus.APPROVED,
    });

    await expect(assertTherapistCanUploadCertificate("therapist-user-id")).rejects.toMatchObject({
      code: "THERAPIST_CERTIFICATE_UPLOAD_LOCKED",
    });
  });

  it("stores confirmed Cloudinary metadata up to the 10MB business limit", async () => {
    findUniqueMock.mockResolvedValue(editableProfile);
    createMock.mockResolvedValue({ id: "certificate-id" });

    await createTherapistCertificateFromCloudinaryUpload(
      "therapist-user-id",
      buildMetadata(),
    );

    expect(createMock).toHaveBeenCalledWith({
      data: {
        therapistProfileId: "therapist-profile-id",
        ...buildMetadata(),
        uploadedAt: expect.any(Date),
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
  });

  it("rejects confirmed Cloudinary metadata above the 10MB business limit", async () => {
    findUniqueMock.mockResolvedValue(editableProfile);

    await expect(
      createTherapistCertificateFromCloudinaryUpload(
        "therapist-user-id",
        buildMetadata(CERTIFICATE_MAX_FILE_SIZE_BYTES + 1),
      ),
    ).rejects.toMatchObject({
      code: "THERAPIST_CERTIFICATE_FILE_TOO_LARGE",
    });

    expect(createMock).not.toHaveBeenCalled();
  });

  it("keeps the legacy Server Action upload below the temporary Vercel-safe limit", async () => {
    findUniqueMock.mockResolvedValue(editableProfile);
    isConfiguredMock.mockReturnValue(true);
    const file = new File(
      [new Uint8Array(CERTIFICATE_SERVER_ACTION_MAX_FILE_SIZE_BYTES + 1)],
      "legacy.pdf",
      { type: "application/pdf" },
    );

    await expect(uploadTherapistCertificates("therapist-user-id", [file])).rejects.toMatchObject({
      code: "THERAPIST_CERTIFICATE_SERVER_ACTION_FILE_TOO_LARGE",
    });

    expect(providerUploadMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});
