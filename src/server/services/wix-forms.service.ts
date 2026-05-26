import "server-only";
import { getWixConfig, wixRequest } from "@/lib/wix/wix-client";
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
  "Структура Wix Form не відповідає очікуваній. Перевірте поля форми перед тестовою синхронізацією.";

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
  specialisation: string;
  pricePerHour: string;
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
      "Wix Forms повернув неочікувану структуру форми.",
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
  const formSummary = await getWixTherapistApplicationFormSummary();
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
  const values: Record<string, string> = {
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

function parseCreatedSubmissionResponse(response: unknown) {
  const submission = isRecord(response) && isRecord(response.submission)
    ? response.submission
    : null;
  const submissionId = submission ? readOptionalString(submission.id) : null;

  if (!submissionId) {
    throw new WixFormsServiceError(
      "Wix Forms не повернув ідентифікатор створеного запису.",
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

  if (!preflight.canCreateTestSubmission) {
    throw new WixFormsServiceError(
      WIX_THERAPIST_FORM_STRUCTURE_MISMATCH_MESSAGE,
      "WIX_FORM_STRUCTURE_MISMATCH",
      preflight,
    );
  }

  const { therapistApplicationFormId } = getWixConfig();
  const submissions = buildWixTherapistApplicationSubmissionValues(input, {
    includeCertificates: preflight.certificateTextValueSupported,
  });

  try {
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
      fieldTargets: Object.keys(submissions),
      error,
    });

    throw new WixFormsServiceError(
      "Не вдалося створити запис у Wix Forms.",
      "WIX_SUBMISSION_CREATE_FAILED",
    );
  }
}
