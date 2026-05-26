import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WIX_THERAPIST_FORM_FIELD_KEYS,
  WIX_THERAPIST_FORM_STRUCTURE_MISMATCH_MESSAGE,
  buildWixTherapistApplicationSubmissionValues,
  createWixTherapistApplicationSubmission,
  type WixFormSummary,
  type WixTherapistApplicationInput,
  WixFormsServiceError,
  validateWixTherapistApplicationFieldKeys,
} from "@/server/services/wix-forms.service";

const wixRequestMock = vi.hoisted(() => vi.fn());
const getWixConfigMock = vi.hoisted(() => vi.fn());
const logDiagnosticEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/wix/wix-client", () => ({
  getWixConfig: getWixConfigMock,
  wixRequest: wixRequestMock,
}));

vi.mock("@/server/services/audit-log.service", () => ({
  logDiagnosticEvent: logDiagnosticEventMock,
}));

const applicationInput: WixTherapistApplicationInput = {
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
};

function buildSummary(overrides: Partial<WixFormSummary> = {}): WixFormSummary {
  return {
    id: "test-form-id",
    fields: Object.values(WIX_THERAPIST_FORM_FIELD_KEYS).map((target) => ({
      id: `${target}-id`,
      target,
      label: target,
      type: "STRING",
      deleted: false,
      required: true,
    })),
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("Wix therapist application form preflight", () => {
  it("accepts a form summary containing all active expected targets", () => {
    const result = validateWixTherapistApplicationFieldKeys(buildSummary());

    expect(result.fieldKeysValid).toBe(true);
    expect(result.fieldTargetsValid).toBe(true);
    expect(result.missingFieldTargets).toEqual([]);
    expect(result.deletedFieldTargets).toEqual([]);
    expect(result.unexpectedRequiredFieldTargets).toEqual([]);
    expect(result.certificateTextValueSupported).toBe(true);
    expect(result.canCreateTestSubmission).toBe(true);
    expect(result.message).toBeNull();
  });

  it("reports missing and deleted Wix field targets", () => {
    const summary = buildSummary();
    summary.fields = summary.fields
      .filter((field) => field.target !== WIX_THERAPIST_FORM_FIELD_KEYS.email)
      .map((field) =>
        field.target === WIX_THERAPIST_FORM_FIELD_KEYS.pricePerHour
          ? { ...field, deleted: true }
          : field,
      );

    const result = validateWixTherapistApplicationFieldKeys(summary);

    expect(result.fieldTargetsValid).toBe(false);
    expect(result.missingFieldTargets).toEqual([
      WIX_THERAPIST_FORM_FIELD_KEYS.email,
    ]);
    expect(result.deletedFieldTargets).toEqual([
      WIX_THERAPIST_FORM_FIELD_KEYS.pricePerHour,
    ]);
    expect(result.canCreateTestSubmission).toBe(false);
    expect(result.message).toBe(WIX_THERAPIST_FORM_STRUCTURE_MISMATCH_MESSAGE);
  });

  it("flags a certificate field that cannot be sent as plain text", () => {
    const summary = buildSummary();
    summary.fields = summary.fields.map((field) =>
      field.target === WIX_THERAPIST_FORM_FIELD_KEYS.certificates
        ? { ...field, type: "FILE_UPLOAD" }
        : field,
    );

    const result = validateWixTherapistApplicationFieldKeys(summary);

    expect(result.fieldTargetsValid).toBe(true);
    expect(result.certificateField?.type).toBe("FILE_UPLOAD");
    expect(result.certificateTextValueSupported).toBe(false);
    expect(result.certificateUploadRequired).toBe(true);
    expect(result.canCreateTestSubmission).toBe(false);
  });

  it("permits an optional file certificate field by omitting it from submission", () => {
    const summary = buildSummary();
    summary.fields = summary.fields.map((field) =>
      field.target === WIX_THERAPIST_FORM_FIELD_KEYS.certificates
        ? { ...field, type: "FILE_UPLOAD", required: false }
        : field,
    );

    const result = validateWixTherapistApplicationFieldKeys(summary);

    expect(result.certificateTextValueSupported).toBe(false);
    expect(result.certificateFieldCanBeOmitted).toBe(true);
    expect(result.certificateUploadRequired).toBe(false);
    expect(result.canCreateTestSubmission).toBe(true);
  });

  it("blocks a submission when Wix reports a required field outside our payload", () => {
    const summary = buildSummary();
    summary.fields.push({
      id: "additional-required-id",
      target: "additional_required_field",
      label: "Additional required field",
      type: "STRING",
      deleted: false,
      required: true,
    });

    const result = validateWixTherapistApplicationFieldKeys(summary);

    expect(result.fieldKeysValid).toBe(true);
    expect(result.requiredFieldValidationAvailable).toBe(true);
    expect(result.unexpectedRequiredFieldTargets).toEqual(["additional_required_field"]);
    expect(result.canCreateTestSubmission).toBe(false);
    expect(result.message).toBe(WIX_THERAPIST_FORM_STRUCTURE_MISMATCH_MESSAGE);
  });
});

describe("Wix therapist application submission", () => {
  it("maps therapist input to Wix field keys and includes text certificates", () => {
    expect(buildWixTherapistApplicationSubmissionValues(applicationInput)).toEqual({
      [WIX_THERAPIST_FORM_FIELD_KEYS.nameAndSurname]: applicationInput.nameAndSurname,
      [WIX_THERAPIST_FORM_FIELD_KEYS.gender]: applicationInput.gender,
      [WIX_THERAPIST_FORM_FIELD_KEYS.email]: applicationInput.email,
      [WIX_THERAPIST_FORM_FIELD_KEYS.contactNumber]: applicationInput.contactNumber,
      [WIX_THERAPIST_FORM_FIELD_KEYS.therapyServicesProvided]:
        applicationInput.therapyServicesProvided,
      [WIX_THERAPIST_FORM_FIELD_KEYS.yearsOfExperience]:
        applicationInput.yearsOfExperience,
      [WIX_THERAPIST_FORM_FIELD_KEYS.educationAndCertifications]:
        applicationInput.educationAndCertifications,
      [WIX_THERAPIST_FORM_FIELD_KEYS.certificates]: applicationInput.certificates,
      [WIX_THERAPIST_FORM_FIELD_KEYS.specialisation]: applicationInput.specialisation,
      [WIX_THERAPIST_FORM_FIELD_KEYS.pricePerHour]: applicationInput.pricePerHour,
    });
  });

  it("creates a Wix submission after a successful text-field preflight", async () => {
    getWixConfigMock.mockReturnValue({
      therapistApplicationFormId: "test-form-id",
    });
    wixRequestMock
      .mockResolvedValueOnce({ formSummary: buildSummary() })
      .mockResolvedValueOnce({
        submission: {
          id: "new-submission-id",
          formId: "test-form-id",
          submissions: buildWixTherapistApplicationSubmissionValues(applicationInput),
        },
      });

    await expect(createWixTherapistApplicationSubmission(applicationInput)).resolves.toEqual({
      success: true,
      wixSubmissionId: "new-submission-id",
      submission: expect.objectContaining({ id: "new-submission-id" }),
    });

    expect(wixRequestMock).toHaveBeenNthCalledWith(
      2,
      "/form-submission-service/v4/submissions",
      {
        method: "POST",
        body: {
          submission: {
            formId: "test-form-id",
            submissions: buildWixTherapistApplicationSubmissionValues(applicationInput),
          },
        },
      },
    );
  });

  it("omits optional file certificates from the submitted payload", async () => {
    const optionalFileSummary = buildSummary();
    optionalFileSummary.fields = optionalFileSummary.fields.map((field) =>
      field.target === WIX_THERAPIST_FORM_FIELD_KEYS.certificates
        ? { ...field, type: "FILE_UPLOAD", required: false }
        : field,
    );
    getWixConfigMock.mockReturnValue({
      therapistApplicationFormId: "test-form-id",
    });
    wixRequestMock
      .mockResolvedValueOnce({ formSummary: optionalFileSummary })
      .mockResolvedValueOnce({
        submission: { id: "file-optional-submission-id" },
      });

    await createWixTherapistApplicationSubmission(applicationInput);

    const [, createCallOptions] = wixRequestMock.mock.calls[1];
    const submissionValues = createCallOptions.body.submission.submissions;

    expect(submissionValues).not.toHaveProperty(WIX_THERAPIST_FORM_FIELD_KEYS.certificates);
  });

  it("does not call create submission when preflight blocks the schema", async () => {
    const requiredFileSummary = buildSummary();
    requiredFileSummary.fields = requiredFileSummary.fields.map((field) =>
      field.target === WIX_THERAPIST_FORM_FIELD_KEYS.certificates
        ? { ...field, type: "FILE_UPLOAD", required: true }
        : field,
    );
    getWixConfigMock.mockReturnValue({
      therapistApplicationFormId: "test-form-id",
    });
    wixRequestMock.mockResolvedValueOnce({ formSummary: requiredFileSummary });

    await expect(createWixTherapistApplicationSubmission(applicationInput)).rejects.toMatchObject({
      code: "WIX_FORM_STRUCTURE_MISMATCH",
      message: WIX_THERAPIST_FORM_STRUCTURE_MISMATCH_MESSAGE,
    } satisfies Partial<WixFormsServiceError>);
    expect(wixRequestMock).toHaveBeenCalledTimes(1);
  });

  it("returns a controlled service error when Wix rejects creation", async () => {
    getWixConfigMock.mockReturnValue({
      therapistApplicationFormId: "test-form-id",
    });
    wixRequestMock
      .mockResolvedValueOnce({ formSummary: buildSummary() })
      .mockRejectedValueOnce(new Error("Provider denied submission"));

    await expect(createWixTherapistApplicationSubmission(applicationInput)).rejects.toMatchObject({
      code: "WIX_SUBMISSION_CREATE_FAILED",
      message: "Не вдалося створити запис у Wix Forms.",
    } satisfies Partial<WixFormsServiceError>);
    expect(logDiagnosticEventMock).toHaveBeenCalledWith(
      "wix-forms",
      "Unable to create Wix therapist submission.",
      expect.objectContaining({ formId: "test-form-id" }),
    );
  });

  it("rejects a Wix create response that has no submission id", async () => {
    getWixConfigMock.mockReturnValue({
      therapistApplicationFormId: "test-form-id",
    });
    wixRequestMock
      .mockResolvedValueOnce({ formSummary: buildSummary() })
      .mockResolvedValueOnce({ submission: { formId: "test-form-id" } });

    await expect(createWixTherapistApplicationSubmission(applicationInput)).rejects.toMatchObject({
      code: "WIX_SUBMISSION_INVALID_RESPONSE",
    } satisfies Partial<WixFormsServiceError>);
  });
});
