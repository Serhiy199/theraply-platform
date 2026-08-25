import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const requireActionRoleMock = vi.hoisted(() => vi.fn());
const createPromoCodeMock = vi.hoisted(() => vi.fn());
const updatePromoCodeMock = vi.hoisted(() => vi.fn());
const activatePromoCodeMock = vi.hoisted(() => vi.fn());
const deactivatePromoCodeMock = vi.hoisted(() => vi.fn());
const errorClasses = vi.hoisted(() => ({
  ActionPermissionError: class ActionPermissionError extends Error {},
  PromoCodeAdminServiceError: class PromoCodeAdminServiceError extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/permissions", () => ({
  ActionPermissionError: errorClasses.ActionPermissionError,
  requireActionRole: requireActionRoleMock,
}));
vi.mock("@/server/services/promo-code-admin.service", () => ({
  PromoCodeAdminServiceError: errorClasses.PromoCodeAdminServiceError,
  createPromoCode: createPromoCodeMock,
  updatePromoCode: updatePromoCodeMock,
  activatePromoCode: activatePromoCodeMock,
  deactivatePromoCode: deactivatePromoCodeMock,
}));

import {
  activatePromoCodeAction,
  createPromoCodeAction,
  deactivatePromoCodeAction,
  updatePromoCodeAction,
} from "@/app/admin/promocodes/actions";

beforeEach(() => {
  requireActionRoleMock.mockResolvedValue({ id: "admin-id" });
  createPromoCodeMock.mockResolvedValue({ id: "promo-id" });
  updatePromoCodeMock.mockResolvedValue({ id: "promo-id" });
  activatePromoCodeMock.mockResolvedValue({ id: "promo-id" });
  deactivatePromoCodeMock.mockResolvedValue({ id: "promo-id" });
});

function createFormData() {
  const formData = new FormData();
  formData.set("code", " save5 ");
  formData.set("discountPercent", "5");
  formData.set("expiresAt", "2026-09-01T10:30");
  return formData;
}

function updateFormData() {
  const formData = new FormData();
  formData.set("promoCodeId", "promo-id");
  formData.set("discountPercent", "5");
  formData.set("expiresAt", "");
  return formData;
}

describe("admin promo code actions", () => {
  it("allows an authenticated ADMIN to create and immediately revalidates the list", async () => {
    await expect(
      createPromoCodeAction({ status: "idle" }, createFormData()),
    ).resolves.toEqual({
      status: "success",
      message: "Promo code created successfully.",
    });

    expect(createPromoCodeMock).toHaveBeenCalledWith("admin-id", {
      code: " save5 ",
      discountPercent: 5,
      expiresAt: new Date("2026-09-01T10:30:00.000Z"),
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/promocodes");
  });

  it.each(["unauthenticated", "CLIENT", "THERAPIST"])(
    "rejects %s create attempts without calling the service",
    async () => {
      requireActionRoleMock.mockRejectedValue(
        new errorClasses.ActionPermissionError(),
      );

      await expect(
        createPromoCodeAction({ status: "idle" }, createFormData()),
      ).resolves.toEqual({
        status: "error",
        message: "You do not have permission to perform this action.",
      });
      expect(createPromoCodeMock).not.toHaveBeenCalled();
    },
  );

  it("returns a safe duplicate normalized-code error", async () => {
    createPromoCodeMock.mockRejectedValue(
      new errorClasses.PromoCodeAdminServiceError("DUPLICATE_CODE"),
    );

    await expect(
      createPromoCodeAction({ status: "idle" }, createFormData()),
    ).resolves.toEqual({
      status: "error",
      message: "A promo code with this code already exists.",
    });
  });

  it("returns a specific used-discount lock message", async () => {
    updatePromoCodeMock.mockRejectedValue(
      new errorClasses.PromoCodeAdminServiceError(
        "USED_DISCOUNT_IMMUTABLE",
      ),
    );

    await expect(
      updatePromoCodeAction({ status: "idle" }, updateFormData()),
    ).resolves.toEqual({
      status: "error",
      message:
        "This promo code has already been used and its discount percentage can no longer be changed.",
    });
  });

  it("rejects an invalid UTC calendar value safely", async () => {
    const formData = createFormData();
    formData.set("expiresAt", "2026-02-31T10:30");
    createPromoCodeMock.mockRejectedValue(
      new errorClasses.PromoCodeAdminServiceError("INVALID_EXPIRY"),
    );

    await expect(
      createPromoCodeAction({ status: "idle" }, formData),
    ).resolves.toEqual({
      status: "error",
      message: "Enter a valid expiry date and time in UTC.",
    });
    expect(createPromoCodeMock).toHaveBeenCalledWith(
      "admin-id",
      expect.objectContaining({ expiresAt: expect.any(Date) }),
    );
    expect(
      createPromoCodeMock.mock.calls[0][1].expiresAt.getTime(),
    ).toBeNaN();
  });

  it("updates expiry settings without changing code", async () => {
    await expect(
      updatePromoCodeAction({ status: "idle" }, updateFormData()),
    ).resolves.toEqual({
      status: "success",
      message: "Promo code settings updated.",
    });

    expect(updatePromoCodeMock).toHaveBeenCalledWith("admin-id", "promo-id", {
      discountPercent: 5,
      expiresAt: null,
    });
  });

  it("deactivates and reactivates through separate audited service calls", async () => {
    const formData = updateFormData();

    await expect(
      deactivatePromoCodeAction({ status: "idle" }, formData),
    ).resolves.toEqual({
      status: "success",
      message: "Promo code deactivated.",
    });
    await expect(
      activatePromoCodeAction({ status: "idle" }, formData),
    ).resolves.toEqual({
      status: "success",
      message: "Promo code reactivated.",
    });

    expect(deactivatePromoCodeMock).toHaveBeenCalledWith("admin-id", "promo-id");
    expect(activatePromoCodeMock).toHaveBeenCalledWith("admin-id", "promo-id");
  });
});
