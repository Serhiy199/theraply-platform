import { afterEach, describe, expect, it, vi } from "vitest";

import { WixApiRequestError } from "@/lib/wix/wix-client";
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
  WixApiRequestError: class WixApiRequestError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly details: unknown,
    ) {
      super(message);
    }
  },
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
  vi.unstubAllGlobals();
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

  it("uploads stored certificates to Wix Media and submits Wix file objects", async () => {
    const optionalFileSummary = buildSummary();
    optionalFileSummary.fields = optionalFileSummary.fields.map((field) =>
      field.target === WIX_THERAPIST_FORM_FIELD_KEYS.certificates
        ? { ...field, type: "FILE_UPLOAD", required: false }
        : field,
    );
    const inputWithAsset: WixTherapistApplicationInput = {
      ...applicationInput,
      certificates: null,
      certificateAssets: [
        {
          fileName: "qualification.png",
          fileUrl: "https://res.cloudinary.com/test/image/upload/qualification.png",
          mimeType: "image/png",
        },
      ],
    };
    const wixUploadUrl = "https://upload.wixmp.com/upload/signed-upload-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("certificate-bytes", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            file: {
              id: "wix-file-id.png",
              displayName: "qualification.png",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    getWixConfigMock.mockReturnValue({
      therapistApplicationFormId: "test-form-id",
    });
    wixRequestMock
      .mockResolvedValueOnce({ formSummary: optionalFileSummary })
      .mockResolvedValueOnce({ uploadUrl: wixUploadUrl })
      .mockResolvedValueOnce({ submission: { id: "file-submission-id" } });

    await createWixTherapistApplicationSubmission(inputWithAsset);

    expect(wixRequestMock).toHaveBeenNthCalledWith(
      2,
      "/form-submission-service/v4/submissions/media-upload-url",
      {
        method: "POST",
        body: {
          formId: "test-form-id",
          filename: "qualification.png",
          mimeType: "image/png",
        },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://res.cloudinary.com/test/image/upload/qualification.png",
      { cache: "no-store" },
    );
    expect(fetchMock.mock.calls[1][0].toString()).toBe(
      `${wixUploadUrl}?filename=qualification.png`,
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "image/png" },
    });
    const [, createCallOptions] = wixRequestMock.mock.calls[2];
    expect(createCallOptions.body.submission.submissions).toHaveProperty(
      WIX_THERAPIST_FORM_FIELD_KEYS.certificates,
      [
        {
          fileId: "wix-file-id.png",
          displayName: "qualification.png",
          fileType: "image/png",
        },
      ],
    );
  });

  it("accepts a required file field when a stored certificate asset is available", async () => {
    const requiredFileSummary = buildSummary();
    requiredFileSummary.fields = requiredFileSummary.fields.map((field) =>
      field.target === WIX_THERAPIST_FORM_FIELD_KEYS.certificates
        ? { ...field, type: "FILE_UPLOAD", required: true }
        : field,
    );
    const wixUploadUrl = "https://upload.wixmp.com/upload/required-file-token";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("certificate-bytes", { status: 200 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              file: {
                id: "required-wix-file-id.pdf",
                displayName: "required.pdf",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
    );

    getWixConfigMock.mockReturnValue({
      therapistApplicationFormId: "test-form-id",
    });
    wixRequestMock
      .mockResolvedValueOnce({ formSummary: requiredFileSummary })
      .mockResolvedValueOnce({ uploadUrl: wixUploadUrl })
      .mockResolvedValueOnce({ submission: { id: "required-file-submission-id" } });

    await expect(
      createWixTherapistApplicationSubmission({
        ...applicationInput,
        certificates: null,
        certificateAssets: [
          {
            fileName: "required.pdf",
            fileUrl: "https://res.cloudinary.com/test/raw/upload/required.pdf",
            mimeType: "application/pdf",
          },
        ],
      }),
    ).resolves.toMatchObject({ wixSubmissionId: "required-file-submission-id" });

    const [, createCallOptions] = wixRequestMock.mock.calls[2];
    expect(createCallOptions.body.submission.submissions).toHaveProperty(
      WIX_THERAPIST_FORM_FIELD_KEYS.certificates,
      [
        {
          fileId: "required-wix-file-id.pdf",
          displayName: "required.pdf",
          fileType: "application/pdf",
        },
      ],
    );
  });

  it("reads full form requirements when summary omits optional file metadata", async () => {
    const summaryWithoutRequiredValues = buildSummary();
    summaryWithoutRequiredValues.fields = summaryWithoutRequiredValues.fields.map((field) => ({
      ...field,
      type:
        field.target === WIX_THERAPIST_FORM_FIELD_KEYS.certificates
          ? "WIX_FILE"
          : field.type,
      required: null,
    }));
    getWixConfigMock.mockReturnValue({
      therapistApplicationFormId: "test-form-id",
    });
    wixRequestMock
      .mockResolvedValueOnce({ formSummary: summaryWithoutRequiredValues })
      .mockResolvedValueOnce({
        form: {
          formFields: summaryWithoutRequiredValues.fields.map((field) => ({
            fieldType: "INPUT",
            inputOptions: {
              target: field.target,
              required: field.target !== WIX_THERAPIST_FORM_FIELD_KEYS.certificates,
            },
          })),
        },
      })
      .mockResolvedValueOnce({
        submission: { id: "enriched-summary-submission-id" },
      });

    await createWixTherapistApplicationSubmission(applicationInput);

    expect(wixRequestMock).toHaveBeenNthCalledWith(
      2,
      "/form-schema-service/v4/forms/test-form-id",
      { method: "GET" },
    );
    const [, createCallOptions] = wixRequestMock.mock.calls[2];
    expect(createCallOptions.body.submission.submissions).not.toHaveProperty(
      WIX_THERAPIST_FORM_FIELD_KEYS.certificates,
    );
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
      message: "Could not create a record in Wix Forms.",
    } satisfies Partial<WixFormsServiceError>);
    expect(logDiagnosticEventMock).toHaveBeenCalledWith(
      "wix-forms",
      "Unable to create Wix therapist submission.",
      expect.objectContaining({ formId: "test-form-id" }),
    );
  });

  it("logs readable Wix field validation issues without logging request secrets", async () => {
    getWixConfigMock.mockReturnValue({
      therapistApplicationFormId: "test-form-id",
    });
    wixRequestMock
      .mockResolvedValueOnce({ formSummary: buildSummary() })
      .mockRejectedValueOnce(
        new WixApiRequestError("The Wix API request failed.", 400, {
          details: {
            validationError: {
              fieldViolations: [
                {
                  data: {
                    errors: [
                      {
                        errorPath: WIX_THERAPIST_FORM_FIELD_KEYS.certificates,
                        errorType: "TYPE_ERROR",
                        errorMessage: "must be array",
                      },
                    ],
                  },
                },
              ],
            },
          },
        }),
      );

    await expect(createWixTherapistApplicationSubmission(applicationInput)).rejects.toMatchObject({
      code: "WIX_SUBMISSION_CREATE_FAILED",
    } satisfies Partial<WixFormsServiceError>);
    expect(logDiagnosticEventMock).toHaveBeenCalledWith(
      "wix-forms",
      "Unable to create Wix therapist submission.",
      expect.objectContaining({
        wixValidationIssuesJson: expect.stringContaining("must be array"),
      }),
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
