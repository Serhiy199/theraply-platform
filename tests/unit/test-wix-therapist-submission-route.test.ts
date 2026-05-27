import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WixConfigError } from "@/lib/wix/wix-client";
import { ActionPermissionError } from "@/lib/permissions";
import {
  WIX_THERAPIST_FORM_STRUCTURE_MISMATCH_MESSAGE,
  WixFormsServiceError,
} from "@/server/services/wix-forms.service";
import { POST } from "@/app/api/admin/dev/test-wix-therapist-submission/route";

const getCurrentUserMock = vi.hoisted(() => vi.fn());
const requireCurrentActionRoleMock = vi.hoisted(() => vi.fn());
const createSubmissionMock = vi.hoisted(() => vi.fn());
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

vi.mock("@/server/services/wix-forms.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/wix-forms.service")>();

  return {
    ...actual,
    createWixTherapistApplicationSubmission: createSubmissionMock,
  };
});

vi.mock("@/server/services/audit-log.service", () => ({
  logDiagnosticEvent: logDiagnosticEventMock,
}));

const currentAdmin = {
  id: "admin-user-id",
  email: "admin@example.com",
  role: "ADMIN",
};

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  getCurrentUserMock.mockResolvedValue(currentAdmin);
  requireCurrentActionRoleMock.mockResolvedValue(currentAdmin);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("POST /api/admin/dev/test-wix-therapist-submission", () => {
  it("returns 404 outside development without attempting auth or Wix submission", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await POST();

    expect(response.status).toBe(404);
    expect(getCurrentUserMock).not.toHaveBeenCalled();
    expect(createSubmissionMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(401);
    expect(await readJson(response)).toMatchObject({
      success: false,
      error: "Administrator authentication is required.",
    });
  });

  it("rejects authenticated non-admin requests", async () => {
    requireCurrentActionRoleMock.mockRejectedValue(
      new ActionPermissionError("Admin role required."),
    );

    const response = await POST();

    expect(response.status).toBe(403);
    expect(await readJson(response)).toMatchObject({
      success: false,
      error: "Only administrators can access this endpoint.",
    });
  });

  it("creates the fixed test submission for an authenticated admin", async () => {
    createSubmissionMock.mockResolvedValue({
      success: true,
      wixSubmissionId: "submission-id",
      submission: {},
    });

    const response = await POST();

    expect(response.status).toBe(200);
    expect(createSubmissionMock).toHaveBeenCalledWith({
      nameAndSurname: "Test Therapist Sync",
      gender: "Female",
      email: "test.therapist.sync@example.com",
      contactNumber: "+44 7000 000000",
      therapyServicesProvided: "Personal therapy",
      yearsOfExperience: "5",
      educationAndCertifications: "Test education and certifications",
      certificates: "No certificates attached in test submission",
      specialisation: "Anxiety, stress, relationship difficulties",
      pricePerHour: "50",
    });
    expect(await readJson(response)).toEqual({
      success: true,
      message: "Test record created in Wix Forms successfully.",
      wixSubmissionId: "submission-id",
    });
  });

  it("returns the schema mismatch message without exposing technical details", async () => {
    createSubmissionMock.mockRejectedValue(
      new WixFormsServiceError(
        WIX_THERAPIST_FORM_STRUCTURE_MISMATCH_MESSAGE,
        "WIX_FORM_STRUCTURE_MISMATCH",
        { missingFieldTargets: ["email"] },
      ),
    );

    const response = await POST();
    const body = await readJson(response);

    expect(response.status).toBe(409);
    expect(body).toEqual({
      success: false,
      message: "Could not create a test record in Wix Forms.",
      error: WIX_THERAPIST_FORM_STRUCTURE_MISMATCH_MESSAGE,
    });
    expect(JSON.stringify(body)).not.toContain("missingFieldTargets");
    expect(logDiagnosticEventMock).toHaveBeenCalled();
  });

  it("returns a controlled configuration message for missing Wix env", async () => {
    createSubmissionMock.mockRejectedValue(
      new WixConfigError("WIX_API_TOKEN is not configured."),
    );

    const response = await POST();

    expect(response.status).toBe(503);
    expect(await readJson(response)).toMatchObject({
      success: false,
      error: "WIX_API_TOKEN is not configured.",
    });
  });

  it("returns the agreed generic failure response when Wix creation fails", async () => {
    createSubmissionMock.mockRejectedValue(
      new WixFormsServiceError(
        "Could not create a record in Wix Forms.",
        "WIX_SUBMISSION_CREATE_FAILED",
        { status: 403, response: { message: "Permission denied" } },
      ),
    );

    const response = await POST();

    expect(response.status).toBe(502);
    expect(await readJson(response)).toEqual({
      success: false,
      message: "Could not create a test record in Wix Forms.",
      error: "Review the Wix API configuration or form structure.",
    });
    expect(logDiagnosticEventMock).toHaveBeenCalled();
  });
});
