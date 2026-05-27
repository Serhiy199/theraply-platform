import "server-only";
import { getWixConfig, WixApiRequestError, wixRequest } from "@/lib/wix/wix-client";
import { logDiagnosticEvent } from "@/server/services/audit-log.service";

export const WIX_THERAPIST_FORM_FIELD_KEYS = {
  nameAndSurname: "name_and_surname",
  gender: "gender",
  email: "email",
  contactNumber: "contact_number",
  therapyServicesProvided:
    "therapy_services_provided_personal_therapy_couple_therapy_child",
  yearsOfExperience: "years_of_experience",
  educationAndCertifications: "education_and_certifications_1",
  certificates: "add_your_certificates_here_if_you_have_any",
  specialisation:
    "specialisation_e_g_anxiety_trauma_couples_counselling_child_deve",
  pricePerHour: "price_per_hour",
} as const;

export const WIX_THERAPIST_APPLICATION_FIELD_TARGETS = WIX_THERAPIST_FORM_FIELD_KEYS;

export const WIX_THERAPIST_FORM_STRUCTURE_MISMATCH_MESSAGE =
  "The Wix form structure does not match the expected fields. Review the form fields before synchronizing.";

export type WixFormSummaryField = {
  id: string | null;
  target: string;
  label: string | null;
  type: string | null;
  deleted: boolean;
  required: boolean | null;
};

export type WixFormSummary = {
  id: string;
  fields: WixFormSummaryField[];
};

export type WixTherapistApplicationPreflight = {
  formSummary: WixFormSummary;
  fieldKeysValid: boolean;
  fieldTargetsValid: boolean;
  missingFieldTargets: string[];
  deletedFieldTargets: string[];
  unexpectedRequiredFieldTargets: string[];
  requiredFieldValidationAvailable: boolean;
  certificateField: WixFormSummaryField | null;
  certificateTextValueSupported: boolean;
  certificateFieldCanBeOmitted: boolean;
  certificateUploadRequired: boolean;
  canCreateTestSubmission: boolean;
  message: string | null;
};

export type WixTherapistApplicationInput = {
  nameAndSurname: string;
  gender: string;
  email: string;
  contactNumber: string;
  therapyServicesProvided: string;
  yearsOfExperience: string;
  educationAndCertifications: string;
  certificates?: string | null;
  certificateAssets?: WixTherapistCertificateAsset[];
  specialisation: string;
  pricePerHour: string;
};

export type WixTherapistCertificateAsset = {
  fileName: string;
  fileUrl: string;
  mimeType: string;
};

export type WixTherapistApplicationSubmissionResult = {
  success: true;
  wixSubmissionId: string;
  submission: unknown;
};

export class WixFormsServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "WIX_FORM_SUMMARY_INVALID_RESPONSE"
      | "WIX_FORM_STRUCTURE_MISMATCH"
      | "WIX_CERTIFICATE_UPLOAD_FAILED"
      | "WIX_SUBMISSION_CREATE_FAILED"
      | "WIX_SUBMISSION_INVALID_RESPONSE",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "WixFormsServiceError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRequiredValue(value: Record<string, unknown>) {
  if (typeof value.required === "boolean") {
    return value.required;
  }

  for (const nestedProperty of ["validation", "inputOptions"]) {
    const nestedValue = value[nestedProperty];

    if (isRecord(nestedValue) && typeof nestedValue.required === "boolean") {
      return nestedValue.required;
    }
  }

  return null;
}

function parseFormSummaryField(value: unknown): WixFormSummaryField | null {
  if (!isRecord(value)) {
    return null;
  }

  const target = readOptionalString(value.target);

  if (!target) {
    return null;
  }

  return {
    id: readOptionalString(value.id),
    target,
    label: readOptionalString(value.label),
    type: readOptionalString(value.type),
    deleted: value.deleted === true,
    required: readRequiredValue(value),
  };
}

function parseFormSummaryResponse(response: unknown): WixFormSummary {
  const formSummary = isRecord(response) && isRecord(response.formSummary)
    ? response.formSummary
    : null;
  const id = formSummary ? readOptionalString(formSummary.id) : null;

  if (!id || !Array.isArray(formSummary?.fields)) {
    throw new WixFormsServiceError(
      "Wix Forms returned an unexpected form structure.",
      "WIX_FORM_SUMMARY_INVALID_RESPONSE",
    );
  }

  return {
    id,
    fields: formSummary.fields
      .map((field) => parseFormSummaryField(field))
      .filter((field): field is WixFormSummaryField => field !== null),
  };
}

function mergeFormRequiredValues(
  formSummary: WixFormSummary,
  response: unknown,
): WixFormSummary {
  const form = isRecord(response) && isRecord(response.form) ? response.form : null;
  const formFields = form && Array.isArray(form.formFields) ? form.formFields : null;

  if (!formFields) {
    throw new WixFormsServiceError(
      WIX_THERAPIST_FORM_STRUCTURE_MISMATCH_MESSAGE,
      "WIX_FORM_SUMMARY_INVALID_RESPONSE",
    );
  }

  const requiredValuesByTarget = new Map<string, boolean>();

  for (const field of formFields) {
    if (!isRecord(field) || !isRecord(field.inputOptions)) {
      continue;
    }

    const target = readOptionalString(field.inputOptions.target);
    const required = readRequiredValue(field.inputOptions);

    if (target && required !== null) {
      requiredValuesByTarget.set(target, required);
    }
  }

  return {
    ...formSummary,
    fields: formSummary.fields.map((field) => ({
      ...field,
      required: field.required ?? requiredValuesByTarget.get(field.target) ?? null,
    })),
  };
}

export async function getWixTherapistApplicationFormSummary(): Promise<WixFormSummary> {
  const { therapistApplicationFormId } = getWixConfig();
  const response = await wixRequest<unknown>(
    `/form-schema-service/v4/forms/${encodeURIComponent(therapistApplicationFormId)}/summary`,
    {
      method: "GET",
    },
  );

  return parseFormSummaryResponse(response);
}

async function enrichWixTherapistApplicationFormSummaryRequiredValues(
  formSummary: WixFormSummary,
): Promise<WixFormSummary> {
  const response = await wixRequest<unknown>(
    `/form-schema-service/v4/forms/${encodeURIComponent(formSummary.id)}`,
    {
      method: "GET",
    },
  );

  return mergeFormRequiredValues(formSummary, response);
}

export function validateWixTherapistApplicationFieldKeys(
  formSummary: WixFormSummary,
): WixTherapistApplicationPreflight {
  const fieldsByTarget = new Map(
    formSummary.fields.map((field) => [field.target, field]),
  );
  const expectedFieldTargets = Object.values(WIX_THERAPIST_FORM_FIELD_KEYS);
  const expectedFieldTargetSet = new Set<string>(expectedFieldTargets);
  const missingFieldTargets = expectedFieldTargets.filter(
    (target) => !fieldsByTarget.has(target),
  );
  const deletedFieldTargets = expectedFieldTargets.filter(
    (target) => fieldsByTarget.get(target)?.deleted === true,
  );
  const unexpectedRequiredFieldTargets = formSummary.fields
    .filter(
      (field) =>
        field.required === true &&
        !field.deleted &&
        !expectedFieldTargetSet.has(field.target),
    )
    .map((field) => field.target);
  const certificateField =
    fieldsByTarget.get(WIX_THERAPIST_FORM_FIELD_KEYS.certificates) ?? null;
  const fieldKeysValid =
    missingFieldTargets.length === 0 && deletedFieldTargets.length === 0;
  const certificateTextValueSupported = certificateField?.type === "STRING";
  const certificateFieldCanBeOmitted =
    Boolean(certificateField) &&
    !certificateTextValueSupported &&
    certificateField?.required === false;
  const certificateUploadRequired =
    Boolean(certificateField) &&
    !certificateTextValueSupported &&
    certificateField?.required !== false;
  const canCreateTestSubmission =
    fieldKeysValid &&
    unexpectedRequiredFieldTargets.length === 0 &&
    (certificateTextValueSupported || certificateFieldCanBeOmitted);

  return {
    formSummary,
    fieldKeysValid,
    fieldTargetsValid: fieldKeysValid,
    missingFieldTargets,
    deletedFieldTargets,
    unexpectedRequiredFieldTargets,
    requiredFieldValidationAvailable: formSummary.fields.some(
      (field) => field.required !== null,
    ),
    certificateField,
    certificateTextValueSupported,
    certificateFieldCanBeOmitted,
    certificateUploadRequired,
    canCreateTestSubmission,
    message: canCreateTestSubmission ? null : WIX_THERAPIST_FORM_STRUCTURE_MISMATCH_MESSAGE,
  };
}

export const validateWixTherapistApplicationFieldTargets =
  validateWixTherapistApplicationFieldKeys;

export async function runWixTherapistApplicationFormPreflight() {
  let formSummary = await getWixTherapistApplicationFormSummary();

  if (formSummary.fields.some((field) => field.required === null)) {
    formSummary = await enrichWixTherapistApplicationFormSummaryRequiredValues(formSummary);
  }

  const preflight = validateWixTherapistApplicationFieldKeys(formSummary);

  if (!preflight.canCreateTestSubmission) {
    logDiagnosticEvent(
      "wix-forms",
      "Wix therapist application form preflight requires review.",
      {
        formId: formSummary.id,
        missingFieldTargets: preflight.missingFieldTargets,
        deletedFieldTargets: preflight.deletedFieldTargets,
        unexpectedRequiredFieldTargets: preflight.unexpectedRequiredFieldTargets,
        requiredFieldValidationAvailable: preflight.requiredFieldValidationAvailable,
        certificateFieldType: preflight.certificateField?.type ?? null,
        certificateTextValueSupported: preflight.certificateTextValueSupported,
        certificateFieldCanBeOmitted: preflight.certificateFieldCanBeOmitted,
        certificateUploadRequired: preflight.certificateUploadRequired,
      },
    );
  }

  return preflight;
}

export function buildWixTherapistApplicationSubmissionValues(
  input: WixTherapistApplicationInput,
  options: { includeCertificates?: boolean } = {},
) {
  const values: Record<string, string | string[]> = {
    [WIX_THERAPIST_FORM_FIELD_KEYS.nameAndSurname]: input.nameAndSurname,
    [WIX_THERAPIST_FORM_FIELD_KEYS.gender]: input.gender,
    [WIX_THERAPIST_FORM_FIELD_KEYS.email]: input.email,
    [WIX_THERAPIST_FORM_FIELD_KEYS.contactNumber]: input.contactNumber,
    [WIX_THERAPIST_FORM_FIELD_KEYS.therapyServicesProvided]:
      input.therapyServicesProvided,
    [WIX_THERAPIST_FORM_FIELD_KEYS.yearsOfExperience]: input.yearsOfExperience,
    [WIX_THERAPIST_FORM_FIELD_KEYS.educationAndCertifications]:
      input.educationAndCertifications,
    [WIX_THERAPIST_FORM_FIELD_KEYS.specialisation]: input.specialisation,
    [WIX_THERAPIST_FORM_FIELD_KEYS.pricePerHour]: input.pricePerHour,
  };

  if (options.includeCertificates !== false && input.certificates != null) {
    values[WIX_THERAPIST_FORM_FIELD_KEYS.certificates] = input.certificates;
  }

  return values;
}

async function getCertificateMediaUploadUrlForWixSubmission(
  asset: WixTherapistCertificateAsset,
) {
  const { therapistApplicationFormId } = getWixConfig();
  const mediaUploadResponse = await wixRequest<unknown>(
    "/form-submission-service/v4/submissions/media-upload-url",
    {
      method: "POST",
      body: {
        formId: therapistApplicationFormId,
        filename: asset.fileName,
        mimeType: asset.mimeType,
      },
    },
  );
  const uploadUrl = isRecord(mediaUploadResponse)
    ? readOptionalString(mediaUploadResponse.uploadUrl)
    : null;

  if (!uploadUrl) {
    logDiagnosticEvent("wix-forms", "Wix did not return a certificate media upload URL.", {
      formId: therapistApplicationFormId,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
    });
    throw new WixFormsServiceError(
      "Wix Forms did not return a certificate upload URL.",
      "WIX_CERTIFICATE_UPLOAD_FAILED",
    );
  }

  return uploadUrl;
}

function parseCreatedSubmissionResponse(response: unknown) {
  const submission = isRecord(response) && isRecord(response.submission)
    ? response.submission
    : null;
  const submissionId = submission ? readOptionalString(submission.id) : null;

  if (!submissionId) {
    throw new WixFormsServiceError(
      "Wix Forms did not return an identifier for the created submission.",
      "WIX_SUBMISSION_INVALID_RESPONSE",
      response,
    );
  }

  return {
    submissionId,
    submission,
  };
}

export async function createWixTherapistApplicationSubmission(
  input: WixTherapistApplicationInput,
): Promise<WixTherapistApplicationSubmissionResult> {
  const preflight = await runWixTherapistApplicationFormPreflight();
  const hasCertificateAssets = Boolean(input.certificateAssets?.length);
  const canCreateWithRequiredCertificateUpload =
    preflight.fieldKeysValid &&
    preflight.unexpectedRequiredFieldTargets.length === 0 &&
    preflight.certificateUploadRequired &&
    hasCertificateAssets;

  if (!preflight.canCreateTestSubmission && !canCreateWithRequiredCertificateUpload) {
    throw new WixFormsServiceError(
      WIX_THERAPIST_FORM_STRUCTURE_MISMATCH_MESSAGE,
      "WIX_FORM_STRUCTURE_MISMATCH",
      preflight,
    );
  }

  const { therapistApplicationFormId } = getWixConfig();

  try {
    const submissions = buildWixTherapistApplicationSubmissionValues(input, {
      includeCertificates: preflight.certificateTextValueSupported,
    });

    if (!preflight.certificateTextValueSupported && input.certificateAssets?.length) {
      const certificateUploadUrls: string[] = [];

      for (const certificateAsset of input.certificateAssets) {
        certificateUploadUrls.push(
          await getCertificateMediaUploadUrlForWixSubmission(certificateAsset),
        );
      }

      submissions[WIX_THERAPIST_FORM_FIELD_KEYS.certificates] =
        certificateUploadUrls.length === 1
          ? certificateUploadUrls[0]
          : certificateUploadUrls;
    }

    const response = await wixRequest<unknown>(
      "/form-submission-service/v4/submissions",
      {
        method: "POST",
        body: {
          submission: {
            formId: therapistApplicationFormId,
            submissions,
          },
        },
      },
    );
    const createdSubmission = parseCreatedSubmissionResponse(response);

    return {
      success: true,
      wixSubmissionId: createdSubmission.submissionId,
      submission: createdSubmission.submission,
    };
  } catch (error) {
    if (error instanceof WixFormsServiceError) {
      throw error;
    }

    logDiagnosticEvent("wix-forms", "Unable to create Wix therapist submission.", {
      formId: therapistApplicationFormId,
      fieldTargets: Object.keys(
        buildWixTherapistApplicationSubmissionValues(input, {
          includeCertificates: preflight.certificateTextValueSupported,
        }),
      ),
      certificateAssetCount: input.certificateAssets?.length ?? 0,
      wixStatus: error instanceof WixApiRequestError ? error.status : null,
      wixError: error instanceof WixApiRequestError ? error.details : null,
      error,
    });

    throw new WixFormsServiceError(
      "Could not create a record in Wix Forms.",
      "WIX_SUBMISSION_CREATE_FAILED",
      error instanceof WixApiRequestError
        ? {
            status: error.status,
            response: error.details,
          }
        : undefined,
    );
  }
}
