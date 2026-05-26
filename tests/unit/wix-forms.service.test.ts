import { describe, expect, it } from "vitest";

import {
  WIX_THERAPIST_APPLICATION_FIELD_TARGETS,
  type WixFormSummary,
  validateWixTherapistApplicationFieldTargets,
} from "@/server/services/wix-forms.service";

function buildSummary(overrides: Partial<WixFormSummary> = {}): WixFormSummary {
  return {
    id: "test-form-id",
    fields: Object.values(WIX_THERAPIST_APPLICATION_FIELD_TARGETS).map((target) => ({
      id: `${target}-id`,
      target,
      label: target,
      type: "STRING",
      deleted: false,
    })),
    ...overrides,
  };
}

describe("Wix therapist application form preflight", () => {
  it("accepts a form summary containing all active expected targets", () => {
    const result = validateWixTherapistApplicationFieldTargets(buildSummary());

    expect(result.fieldTargetsValid).toBe(true);
    expect(result.missingFieldTargets).toEqual([]);
    expect(result.deletedFieldTargets).toEqual([]);
    expect(result.certificateTextValueSupported).toBe(true);
  });

  it("reports missing and deleted Wix field targets", () => {
    const summary = buildSummary();
    summary.fields = summary.fields
      .filter((field) => field.target !== WIX_THERAPIST_APPLICATION_FIELD_TARGETS.email)
      .map((field) =>
        field.target === WIX_THERAPIST_APPLICATION_FIELD_TARGETS.pricePerHour
          ? { ...field, deleted: true }
          : field,
      );

    const result = validateWixTherapistApplicationFieldTargets(summary);

    expect(result.fieldTargetsValid).toBe(false);
    expect(result.missingFieldTargets).toEqual([
      WIX_THERAPIST_APPLICATION_FIELD_TARGETS.email,
    ]);
    expect(result.deletedFieldTargets).toEqual([
      WIX_THERAPIST_APPLICATION_FIELD_TARGETS.pricePerHour,
    ]);
  });

  it("flags a certificate field that cannot be sent as plain text", () => {
    const summary = buildSummary();
    summary.fields = summary.fields.map((field) =>
      field.target === WIX_THERAPIST_APPLICATION_FIELD_TARGETS.certificates
        ? { ...field, type: "FILE_UPLOAD" }
        : field,
    );

    const result = validateWixTherapistApplicationFieldTargets(summary);

    expect(result.fieldTargetsValid).toBe(true);
    expect(result.certificateField?.type).toBe("FILE_UPLOAD");
    expect(result.certificateTextValueSupported).toBe(false);
  });
});
