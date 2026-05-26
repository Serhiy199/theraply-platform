import "server-only";
import { getWixConfig, wixRequest } from "@/lib/wix/wix-client";
import { logDiagnosticEvent } from "@/server/services/audit-log.service";

export const WIX_THERAPIST_APPLICATION_FIELD_TARGETS = {
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

export type WixFormSummaryField = {
  id: string | null;
  target: string;
  label: string | null;
  type: string | null;
  deleted: boolean;
};

export type WixFormSummary = {
  id: string;
  fields: WixFormSummaryField[];
};

export type WixTherapistApplicationPreflight = {
  formSummary: WixFormSummary;
  fieldTargetsValid: boolean;
  missingFieldTargets: string[];
  deletedFieldTargets: string[];
  certificateField: WixFormSummaryField | null;
  certificateTextValueSupported: boolean;
};

export class WixFormsServiceError extends Error {
  constructor(
    message: string,
    public readonly code: "WIX_FORM_SUMMARY_INVALID_RESPONSE",
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

export function validateWixTherapistApplicationFieldTargets(
  formSummary: WixFormSummary,
): WixTherapistApplicationPreflight {
  const fieldsByTarget = new Map(
    formSummary.fields.map((field) => [field.target, field]),
  );
  const expectedFieldTargets = Object.values(WIX_THERAPIST_APPLICATION_FIELD_TARGETS);
  const missingFieldTargets = expectedFieldTargets.filter(
    (target) => !fieldsByTarget.has(target),
  );
  const deletedFieldTargets = expectedFieldTargets.filter(
    (target) => fieldsByTarget.get(target)?.deleted === true,
  );
  const certificateField =
    fieldsByTarget.get(WIX_THERAPIST_APPLICATION_FIELD_TARGETS.certificates) ?? null;

  return {
    formSummary,
    fieldTargetsValid: missingFieldTargets.length === 0 && deletedFieldTargets.length === 0,
    missingFieldTargets,
    deletedFieldTargets,
    certificateField,
    certificateTextValueSupported: certificateField?.type === "STRING",
  };
}

export async function runWixTherapistApplicationFormPreflight() {
  const formSummary = await getWixTherapistApplicationFormSummary();
  const preflight = validateWixTherapistApplicationFieldTargets(formSummary);

  if (!preflight.fieldTargetsValid || !preflight.certificateTextValueSupported) {
    logDiagnosticEvent(
      "wix-forms",
      "Wix therapist application form preflight requires review.",
      {
        formId: formSummary.id,
        missingFieldTargets: preflight.missingFieldTargets,
        deletedFieldTargets: preflight.deletedFieldTargets,
        certificateFieldType: preflight.certificateField?.type ?? null,
        certificateTextValueSupported: preflight.certificateTextValueSupported,
      },
    );
  }

  return preflight;
}
