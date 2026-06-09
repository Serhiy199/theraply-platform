import { z } from "zod";

function normalizeOptionalText(value: string) {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

const optionalPayoutTextField = (maxLength: number, message: string) =>
  z
    .string()
    .trim()
    .max(maxLength, message)
    .transform(normalizeOptionalText);

const sessionPriceGbpSchema = z
  .string()
  .trim()
  .max(32, "Session price must be 32 characters or fewer.")
  .transform((value) => value.replace(",", "."))
  .refine((value) => {
    if (!value) {
      return true;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
  }, "Session price must be greater than 0.")
  .transform((value) => {
    if (!value) {
      return null;
    }

    return Math.round(Number(value) * 100);
  });

export const therapistPayoutDetailsPayloadSchema = z.object({
  accountHolderName: z
    .string()
    .trim()
    .min(1, "Account holder name is required.")
    .max(160, "Account holder name must be 160 characters or fewer."),
  bankName: optionalPayoutTextField(160, "Bank name must be 160 characters or fewer."),
  iban: optionalPayoutTextField(80, "IBAN must be 80 characters or fewer."),
  swift: optionalPayoutTextField(40, "SWIFT must be 40 characters or fewer."),
  country: optionalPayoutTextField(80, "Country must be 80 characters or fewer."),
  sessionPriceGbp: sessionPriceGbpSchema,
});

export const therapistSessionPricePayloadSchema = z.object({
  sessionPriceGbp: sessionPriceGbpSchema,
});

export type TherapistPayoutDetailsPayload = z.infer<
  typeof therapistPayoutDetailsPayloadSchema
>;

export type TherapistSessionPricePayload = z.infer<
  typeof therapistSessionPricePayloadSchema
>;
