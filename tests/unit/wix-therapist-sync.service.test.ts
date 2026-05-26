import { TherapistApprovalStatus, WixSyncStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  syncApprovedTherapistToWix,
  WixTherapistSyncServiceError,
} from "@/server/services/wix-therapist-sync.service";

const findUniqueMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const createSubmissionMock = vi.hoisted(() => vi.fn());
const createAuditLogEntryBestEffortMock = vi.hoisted(() => vi.fn());
const logDiagnosticEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    therapistProfile: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
  },
}));

vi.mock("@/server/services/wix-forms.service", () => ({
  createWixTherapistApplicationSubmission: createSubmissionMock,
  WixFormsServiceError: class WixFormsServiceError extends Error {},
}));

vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: createAuditLogEntryBestEffortMock,
  logDiagnosticEvent: logDiagnosticEventMock,
}));

function buildApprovedProfile() {
  return {
    id: "therapist-profile-id",
    displayName: "Fallback Display Name",
    specialization: "Fallback specialization",
    gender: "Female",
    contactNumber: "+44 7000 000000",
    therapyServicesProvided: "Personal therapy",
    yearsOfExperience: "5",
    educationAndCertifications: "Test education",
    specialisation: "Anxiety",
    pricePerHour: "50",
    approvalStatus: TherapistApprovalStatus.APPROVED,
    wixSubmissionId: null,
    wixSyncStatus: WixSyncStatus.NOT_SYNCED,
    wixSyncedAt: null,
    wixSyncError: null,
    user: {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
    },
    certificates: [
      {
        id: "certificate-id",
        fileName: "certificate.pdf",
        fileUrl: "https://files.example.com/certificate.pdf",
        storageProvider: "cloudinary",
        mimeType: "application/pdf",
        size: 1024,
      },
    ],
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("syncApprovedTherapistToWix", () => {
  it("submits persisted therapist fields and records a successful Wix sync", async () => {
    findUniqueMock.mockResolvedValue(buildApprovedProfile());
    createSubmissionMock.mockResolvedValue({
      success: true,
      wixSubmissionId: "wix-submission-id",
      submission: {},
    });
    updateMock.mockResolvedValue({});

    const result = await syncApprovedTherapistToWix("therapist-profile-id");

    expect(createSubmissionMock).toHaveBeenCalledWith({
      nameAndSurname: "Ada Lovelace",
      gender: "Female",
      email: "ada@example.com",
      contactNumber: "+44 7000 000000",
      therapyServicesProvided: "Personal therapy",
      yearsOfExperience: "5",
      educationAndCertifications: "Test education",
      specialisation: "Anxiety",
      pricePerHour: "50",
      certificates: null,
    });
    expect(result).toMatchObject({
      success: true,
      wixSubmissionId: "wix-submission-id",
      wixSyncedAt: expect.any(Date),
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "therapist-profile-id" },
      data: {
        wixSubmissionId: "wix-submission-id",
        wixSyncStatus: WixSyncStatus.SYNCED,
        wixSyncedAt: expect.any(Date),
        wixSyncError: null,
      },
    });
    expect(createAuditLogEntryBestEffortMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "WIX_THERAPIST_SYNC_SUCCEEDED" }),
    );
  });

  it("uses persisted null-safe fallback values without reading profileDraft", async () => {
    findUniqueMock.mockResolvedValue({
      ...buildApprovedProfile(),
      displayName: "Visible Therapist Name",
      specialization: "Profile specialization",
      gender: null,
      contactNumber: null,
      therapyServicesProvided: null,
      yearsOfExperience: null,
      educationAndCertifications: null,
      specialisation: null,
      pricePerHour: null,
      user: {
        firstName: null,
        lastName: null,
        email: "fallback@example.com",
      },
    });
    createSubmissionMock.mockResolvedValue({
      success: true,
      wixSubmissionId: "fallback-submission-id",
      submission: {},
    });
    updateMock.mockResolvedValue({});

    await syncApprovedTherapistToWix("therapist-profile-id");

    expect(createSubmissionMock).toHaveBeenCalledWith({
      nameAndSurname: "Visible Therapist Name",
      gender: "",
      email: "fallback@example.com",
      contactNumber: "",
      therapyServicesProvided: "",
      yearsOfExperience: "",
      educationAndCertifications: "",
      specialisation: "Profile specialization",
      pricePerHour: "",
      certificates: null,
    });
  });

  it("rejects a profile that is not approved without attempting Wix sync", async () => {
    findUniqueMock.mockResolvedValue({
      ...buildApprovedProfile(),
      approvalStatus: TherapistApprovalStatus.PENDING_REVIEW,
    });

    await expect(
      syncApprovedTherapistToWix("therapist-profile-id"),
    ).rejects.toMatchObject({
      code: "THERAPIST_NOT_APPROVED",
      message: "До Wix можна синхронізувати лише погодженого терапевта.",
    } satisfies Partial<WixTherapistSyncServiceError>);

    expect(createSubmissionMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("stores a safe failure status and audit event when Wix submission fails", async () => {
    findUniqueMock.mockResolvedValue(buildApprovedProfile());
    createSubmissionMock.mockRejectedValue(new Error("secret provider failure"));
    updateMock.mockResolvedValue({});

    await expect(
      syncApprovedTherapistToWix("therapist-profile-id"),
    ).rejects.toMatchObject({
      code: "WIX_THERAPIST_SYNC_FAILED",
      message: "Не вдалося синхронізувати терапевта з Wix.",
    } satisfies Partial<WixTherapistSyncServiceError>);

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "therapist-profile-id" },
      data: {
        wixSyncStatus: WixSyncStatus.FAILED,
        wixSyncedAt: null,
        wixSyncError: "Не вдалося синхронізувати терапевта з Wix.",
      },
    });
    expect(logDiagnosticEventMock).toHaveBeenCalledWith(
      "wix-therapist-sync",
      "Unable to sync approved therapist to Wix.",
      expect.objectContaining({
        therapistProfileId: "therapist-profile-id",
        certificateCount: 1,
        error: expect.any(Error),
      }),
    );
    expect(createAuditLogEntryBestEffortMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "WIX_THERAPIST_SYNC_FAILED" }),
    );
  });
});
