"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { SAFE_ERROR_MESSAGES } from "@/lib/errors/safe-error-messages";
import { ActionPermissionError, requireActionRole } from "@/lib/permissions";
import {
  activatePromoCode,
  createPromoCode,
  deactivatePromoCode,
  PromoCodeAdminServiceError,
  updatePromoCode,
} from "@/server/services/promo-code-admin.service";

export type AdminPromoCodeActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

function parseNumber(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() !== ""
    ? Number(value)
    : Number.NaN;
}

function parseUtcExpiry(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
    return new Date(Number.NaN);
  }

  const parsed = new Date(`${normalized}:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return parsed.toISOString().slice(0, 16) === normalized
    ? parsed
    : new Date(Number.NaN);
}

function getErrorState(error: unknown): AdminPromoCodeActionState {
  if (error instanceof ActionPermissionError) {
    return {
      status: "error",
      message: SAFE_ERROR_MESSAGES.permissionDenied,
    };
  }

  if (error instanceof PromoCodeAdminServiceError) {
    const messages: Record<PromoCodeAdminServiceError["code"], string> = {
      ADMIN_NOT_FOUND: SAFE_ERROR_MESSAGES.permissionDenied,
      PROMO_CODE_NOT_FOUND: "Promo code could not be found.",
      DUPLICATE_CODE: "A promo code with this code already exists.",
      INVALID_CODE:
        "Promo code must be 3-32 characters using only A-Z, 0-9, hyphen, or underscore.",
      INVALID_DISCOUNT: "Discount percentage must be a whole number from 1 to 10.",
      INVALID_EXPIRY: "Enter a valid expiry date and time in UTC.",
      CODE_IMMUTABLE: "Promo codes cannot be renamed after creation.",
      USED_DISCOUNT_IMMUTABLE:
        "This promo code has already been used and its discount percentage can no longer be changed.",
    };

    return {
      status: "error",
      message: messages[error.code],
    };
  }

  return {
    status: "error",
    message: "Something went wrong while updating promo codes.",
  };
}

function getPromoCodeId(formData: FormData) {
  return String(formData.get("promoCodeId") ?? "").trim();
}

function revalidatePromoCodes() {
  revalidatePath("/admin/promocodes");
}

export async function createPromoCodeAction(
  _previousState: AdminPromoCodeActionState,
  formData: FormData,
): Promise<AdminPromoCodeActionState> {
  try {
    const admin = await requireActionRole(
      [UserRole.ADMIN],
      "Only admin accounts can create promo codes.",
    );

    await createPromoCode(admin.id, {
      code: String(formData.get("code") ?? ""),
      discountPercent: parseNumber(formData.get("discountPercent")),
      expiresAt: parseUtcExpiry(formData.get("expiresAt")),
    });
    revalidatePromoCodes();

    return {
      status: "success",
      message: "Promo code created successfully.",
    };
  } catch (error) {
    return getErrorState(error);
  }
}

export async function updatePromoCodeAction(
  _previousState: AdminPromoCodeActionState,
  formData: FormData,
): Promise<AdminPromoCodeActionState> {
  try {
    const admin = await requireActionRole(
      [UserRole.ADMIN],
      "Only admin accounts can update promo codes.",
    );
    const promoCodeId = getPromoCodeId(formData);

    if (!promoCodeId) {
      return { status: "error", message: "Promo code identifier is missing." };
    }

    await updatePromoCode(admin.id, promoCodeId, {
      discountPercent: parseNumber(formData.get("discountPercent")),
      expiresAt: parseUtcExpiry(formData.get("expiresAt")),
    });
    revalidatePromoCodes();

    return {
      status: "success",
      message: "Promo code settings updated.",
    };
  } catch (error) {
    return getErrorState(error);
  }
}

async function changePromoCodeState(
  formData: FormData,
  isActive: boolean,
): Promise<AdminPromoCodeActionState> {
  try {
    const admin = await requireActionRole(
      [UserRole.ADMIN],
      "Only admin accounts can change promo code status.",
    );
    const promoCodeId = getPromoCodeId(formData);

    if (!promoCodeId) {
      return { status: "error", message: "Promo code identifier is missing." };
    }

    if (isActive) {
      await activatePromoCode(admin.id, promoCodeId);
    } else {
      await deactivatePromoCode(admin.id, promoCodeId);
    }
    revalidatePromoCodes();

    return {
      status: "success",
      message: isActive ? "Promo code reactivated." : "Promo code deactivated.",
    };
  } catch (error) {
    return getErrorState(error);
  }
}

export async function activatePromoCodeAction(
  _previousState: AdminPromoCodeActionState,
  formData: FormData,
) {
  return changePromoCodeState(formData, true);
}

export async function deactivatePromoCodeAction(
  _previousState: AdminPromoCodeActionState,
  formData: FormData,
) {
  return changePromoCodeState(formData, false);
}
