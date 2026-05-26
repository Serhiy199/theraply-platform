import { TherapistApprovalStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CERTIFICATE_MAX_FILE_SIZE_BYTES } from "@/lib/constants/certificate-upload";
import {
  assertTherapistCanUploadCertificate,
  createTherapistCertificateFromCloudinaryUpload,
} from "@/server/services/certificate-storage.service";

const findUniqueMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());

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

  it("rejects confirmed Cloudinary metadata with unsupported file types", async () => {
    findUniqueMock.mockResolvedValue(editableProfile);

    await expect(
      createTherapistCertificateFromCloudinaryUpload("therapist-user-id", {
        ...buildMetadata(1_024),
        fileName: "malware.exe",
        mimeType: "application/x-msdownload",
      }),
    ).rejects.toMatchObject({
      code: "THERAPIST_CERTIFICATE_FILE_TYPE_UNSUPPORTED",
    });

    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects confirmed certificate metadata with an insecure URL", async () => {
    findUniqueMock.mockResolvedValue(editableProfile);

    await expect(
      createTherapistCertificateFromCloudinaryUpload("therapist-user-id", {
        ...buildMetadata(1_024),
        fileUrl: "http://res.cloudinary.com/demo/raw/upload/qualification.pdf",
      }),
    ).rejects.toMatchObject({
      code: "THERAPIST_CERTIFICATE_METADATA_INVALID",
    });

    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects confirmed certificate metadata without a Cloudinary public ID", async () => {
    findUniqueMock.mockResolvedValue(editableProfile);

    await expect(
      createTherapistCertificateFromCloudinaryUpload("therapist-user-id", {
        ...buildMetadata(1_024),
        publicId: " ",
      }),
    ).rejects.toMatchObject({
      code: "THERAPIST_CERTIFICATE_METADATA_INVALID",
    });

    expect(createMock).not.toHaveBeenCalled();
  });
});
