import { Prisma, UserRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activatePromoCode,
  createPromoCode,
  deactivatePromoCode,
  getAdminPromoCodes,
  getPromoCodeUsageCount,
  PromoCodeAdminServiceError,
  updatePromoCode,
} from "@/server/services/promo-code-admin.service";

const userFindFirstMock = vi.hoisted(() => vi.fn());
const promoFindManyMock = vi.hoisted(() => vi.fn());
const paymentCountMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const promoCreateMock = vi.hoisted(() => vi.fn());
const promoFindUniqueMock = vi.hoisted(() => vi.fn());
const promoUpdateMock = vi.hoisted(() => vi.fn());
const auditCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: userFindFirstMock },
    promoCode: { findMany: promoFindManyMock },
    payment: { count: paymentCountMock },
    $transaction: transactionMock,
  },
}));

const createdAt = new Date("2026-08-22T10:00:00.000Z");
const updatedAt = new Date("2026-08-22T10:00:00.000Z");

function buildPromo(overrides: Record<string, unknown> = {}) {
  return {
    id: "promo-id",
    code: "SAVE5",
    discountPercent: 5,
    isActive: true,
    expiresAt: null,
    createdByAdminId: "admin-id",
    createdAt,
    updatedAt,
    ...overrides,
  };
}

function buildListPromo(overrides: Record<string, unknown> = {}) {
  return {
    ...buildPromo(),
    createdByAdmin: {
      id: "admin-id",
      email: "admin@example.com",
      firstName: "Admin",
      lastName: "User",
    },
    _count: { payments: 0 },
    ...overrides,
  };
}

function uniqueError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.15.0",
    meta: { target: ["code"] },
  });
}

beforeEach(() => {
  userFindFirstMock.mockResolvedValue({ id: "admin-id", role: UserRole.ADMIN });
  promoFindManyMock.mockResolvedValue([]);
  paymentCountMock.mockResolvedValue(0);
  promoCreateMock.mockResolvedValue(buildPromo());
  promoFindUniqueMock.mockResolvedValue({
    ...buildPromo(),
    _count: { payments: 0 },
  });
  promoUpdateMock.mockImplementation(async ({ data }) => buildPromo(data));
  auditCreateMock.mockResolvedValue({ id: "audit-id" });
  transactionMock.mockImplementation(async (callback) =>
    callback({
      user: { findFirst: userFindFirstMock },
      promoCode: {
        create: promoCreateMock,
        findUnique: promoFindUniqueMock,
        update: promoUpdateMock,
      },
      auditLog: { create: auditCreateMock },
    }),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("admin promo code service", () => {
  it("rejects a non-admin service caller before reading promo data", async () => {
    userFindFirstMock.mockResolvedValue(null);

    await expect(getAdminPromoCodes("client-id")).rejects.toMatchObject({
      code: "ADMIN_NOT_FOUND",
    } satisfies Partial<PromoCodeAdminServiceError>);
    expect(promoFindManyMock).not.toHaveBeenCalled();
  });

  it("lists deterministic usage counts and computed lifecycle state", async () => {
    promoFindManyMock.mockResolvedValue([
      buildListPromo({
        expiresAt: new Date("2026-08-22T12:00:00.000Z"),
        _count: { payments: 3 },
      }),
    ]);

    await expect(
      getAdminPromoCodes("admin-id", new Date("2026-08-22T12:00:00.000Z")),
    ).resolves.toEqual([
      expect.objectContaining({
        code: "SAVE5",
        usageCount: 3,
        status: "EXPIRED",
      }),
    ]);
    expect(promoFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  it("derives usage from linked Payments", async () => {
    paymentCountMock.mockResolvedValue(4);

    await expect(getPromoCodeUsageCount("admin-id", "promo-id")).resolves.toBe(4);
    expect(paymentCountMock).toHaveBeenCalledWith({
      where: { promoCodeId: "promo-id" },
    });
  });

  it.each([1, 5, 10])(
    "creates and audits a normalized %i percent promo",
    async (discountPercent) => {
      promoCreateMock.mockImplementation(async ({ data }) => buildPromo(data));

      await createPromoCode("admin-id", {
        code: " save5 ",
        discountPercent,
        expiresAt: null,
      });

      expect(promoCreateMock).toHaveBeenCalledWith({
        data: {
          code: "SAVE5",
          discountPercent,
          expiresAt: null,
          createdByAdminId: "admin-id",
        },
      });
      expect(auditCreateMock).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "PROMO_CODE_CREATED",
          actorUserId: "admin-id",
          entityId: "promo-id",
        }),
      });
    },
  );

  it("lets the DB unique constraint resolve concurrent normalized creates", async () => {
    let claimed = false;
    promoCreateMock.mockImplementation(async ({ data }) => {
      if (claimed) throw uniqueError();
      claimed = true;
      await Promise.resolve();
      return buildPromo(data);
    });

    const results = await Promise.allSettled([
      createPromoCode("admin-id", { code: "save5", discountPercent: 5 }),
      createPromoCode("admin-id", { code: " SAVE5 ", discountPercent: 5 }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      reason: expect.objectContaining({ code: "DUPLICATE_CODE" }),
    });
  });

  it("allows an unused promo discount and expiry update", async () => {
    await updatePromoCode("admin-id", "promo-id", {
      discountPercent: 8,
      expiresAt: new Date("2026-09-01T10:00:00.000Z"),
    });

    expect(promoUpdateMock).toHaveBeenCalledWith({
      where: { id: "promo-id" },
      data: {
        discountPercent: 8,
        expiresAt: new Date("2026-09-01T10:00:00.000Z"),
      },
    });
    expect(auditCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "PROMO_CODE_UPDATED" }),
    });
  });

  it("rejects a discount change after Payment usage", async () => {
    promoFindUniqueMock.mockResolvedValue({
      ...buildPromo(),
      _count: { payments: 1 },
    });

    await expect(
      updatePromoCode("admin-id", "promo-id", {
        discountPercent: 6,
        expiresAt: null,
      }),
    ).rejects.toMatchObject({
      code: "USED_DISCOUNT_IMMUTABLE",
    } satisfies Partial<PromoCodeAdminServiceError>);
    expect(promoUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects code rename attempts even before first use", async () => {
    await expect(
      updatePromoCode("admin-id", "promo-id", {
        code: "NEWSAVE",
        discountPercent: 5,
        expiresAt: null,
      }),
    ).rejects.toMatchObject({
      code: "CODE_IMMUTABLE",
    } satisfies Partial<PromoCodeAdminServiceError>);
    expect(promoUpdateMock).not.toHaveBeenCalled();
  });

  it("allows deactivation after use and records the lifecycle audit", async () => {
    promoFindUniqueMock.mockResolvedValue(buildPromo());

    await deactivatePromoCode("admin-id", "promo-id");

    expect(promoUpdateMock).toHaveBeenCalledWith({
      where: { id: "promo-id" },
      data: { isActive: false },
    });
    expect(auditCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "PROMO_CODE_DEACTIVATED" }),
    });
  });

  it("reactivates without changing an expired promo expiry", async () => {
    const expiresAt = new Date("2026-08-21T10:00:00.000Z");
    promoFindUniqueMock.mockResolvedValue(
      buildPromo({ isActive: false, expiresAt }),
    );
    promoUpdateMock.mockResolvedValue(
      buildPromo({ isActive: true, expiresAt }),
    );

    const result = await activatePromoCode("admin-id", "promo-id");

    expect(promoUpdateMock).toHaveBeenCalledWith({
      where: { id: "promo-id" },
      data: { isActive: true },
    });
    expect(result.expiresAt).toEqual(expiresAt);
    expect(auditCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "PROMO_CODE_ACTIVATED" }),
    });
  });
});
