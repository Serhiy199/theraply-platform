import "server-only";

import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getPromoCodeLifecycleStatus,
  PromoCodeValidationError,
  validatePromoCodeInput,
  validatePromoCodeFormat,
  validatePromoDiscountPercent,
  type PromoCodeLifecycleStatus,
} from "@/lib/promo-code";

export type AdminPromoCodeListItem = {
  id: string;
  code: string;
  discountPercent: number;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByAdmin: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  usageCount: number;
  status: PromoCodeLifecycleStatus;
};

export class PromoCodeAdminServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "ADMIN_NOT_FOUND"
      | "PROMO_CODE_NOT_FOUND"
      | "DUPLICATE_CODE"
      | "INVALID_CODE"
      | "INVALID_DISCOUNT"
      | "INVALID_EXPIRY"
      | "CODE_IMMUTABLE"
      | "USED_DISCOUNT_IMMUTABLE",
  ) {
    super(message);
    this.name = "PromoCodeAdminServiceError";
  }
}

type PromoCodeTransaction = Prisma.TransactionClient;

const promoCodeListSelect = {
  id: true,
  code: true,
  discountPercent: true,
  isActive: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  createdByAdmin: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
  _count: {
    select: {
      payments: true,
    },
  },
} satisfies Prisma.PromoCodeSelect;

type PromoCodeRow = Prisma.PromoCodeGetPayload<{
  select: typeof promoCodeListSelect;
}>;

function toAdminPromoCodeListItem(
  promoCode: PromoCodeRow,
  now: Date,
): AdminPromoCodeListItem {
  return {
    id: promoCode.id,
    code: promoCode.code,
    discountPercent: promoCode.discountPercent,
    isActive: promoCode.isActive,
    expiresAt: promoCode.expiresAt,
    createdAt: promoCode.createdAt,
    updatedAt: promoCode.updatedAt,
    createdByAdmin: promoCode.createdByAdmin,
    usageCount: promoCode._count.payments,
    status: getPromoCodeLifecycleStatus(promoCode, now),
  };
}

function toAuditSnapshot(promoCode: {
  code: string;
  discountPercent: number;
  isActive: boolean;
  expiresAt: Date | null;
}) {
  return {
    code: promoCode.code,
    discountPercent: promoCode.discountPercent,
    isActive: promoCode.isActive,
    expiresAt: promoCode.expiresAt?.toISOString() ?? null,
  };
}

async function assertAdminExists(
  database: Pick<PromoCodeTransaction, "user">,
  adminUserId: string,
) {
  const admin = await database.user.findFirst({
    where: {
      id: adminUserId,
      role: UserRole.ADMIN,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (!admin) {
    throw new PromoCodeAdminServiceError(
      "Admin account not found.",
      "ADMIN_NOT_FOUND",
    );
  }
}

function mapDomainValidationError(error: PromoCodeValidationError) {
  const code =
    error.code === "INVALID_CODE"
      ? "INVALID_CODE"
      : error.code === "INVALID_DISCOUNT"
        ? "INVALID_DISCOUNT"
        : "INVALID_EXPIRY";

  return new PromoCodeAdminServiceError(error.message, code);
}

function isUniqueCodeError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function getAdminPromoCodes(
  adminUserId: string,
  now: Date = new Date(),
): Promise<AdminPromoCodeListItem[]> {
  await assertAdminExists(prisma, adminUserId);

  const promoCodes = await prisma.promoCode.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: promoCodeListSelect,
  });

  return promoCodes.map((promoCode) =>
    toAdminPromoCodeListItem(promoCode, now),
  );
}

export async function getPromoCodeUsageCount(
  adminUserId: string,
  promoCodeId: string,
) {
  await assertAdminExists(prisma, adminUserId);

  return prisma.payment.count({
    where: {
      promoCodeId,
    },
  });
}

export async function createPromoCode(
  adminUserId: string,
  input: {
    code: string;
    discountPercent: number;
    expiresAt?: Date | null;
  },
) {
  let validated: ReturnType<typeof validatePromoCodeInput>;

  try {
    validated = validatePromoCodeInput(input);
  } catch (error) {
    if (error instanceof PromoCodeValidationError) {
      throw mapDomainValidationError(error);
    }
    throw error;
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      await assertAdminExists(transaction, adminUserId);

      const promoCode = await transaction.promoCode.create({
        data: {
          ...validated,
          createdByAdminId: adminUserId,
        },
      });

      await transaction.auditLog.create({
        data: {
          actorUserId: adminUserId,
          entityType: "PromoCode",
          entityId: promoCode.id,
          action: "PROMO_CODE_CREATED",
          after: toAuditSnapshot(promoCode),
        },
      });

      return promoCode;
    });
  } catch (error) {
    if (isUniqueCodeError(error)) {
      throw new PromoCodeAdminServiceError(
        "A promo code with this code already exists.",
        "DUPLICATE_CODE",
      );
    }
    throw error;
  }
}

export async function updatePromoCode(
  adminUserId: string,
  promoCodeId: string,
  input: {
    code?: string;
    discountPercent: number;
    expiresAt: Date | null;
  },
) {
  let discountPercent: number;

  try {
    discountPercent = validatePromoDiscountPercent(input.discountPercent);
    if (input.expiresAt && Number.isNaN(input.expiresAt.getTime())) {
      throw new PromoCodeValidationError(
        "INVALID_EXPIRY",
        "Promo code expiry is invalid.",
      );
    }
  } catch (error) {
    if (error instanceof PromoCodeValidationError) {
      throw mapDomainValidationError(error);
    }
    throw error;
  }

  return prisma.$transaction(async (transaction) => {
    await assertAdminExists(transaction, adminUserId);

    const current = await transaction.promoCode.findUnique({
      where: {
        id: promoCodeId,
      },
      select: {
        id: true,
        code: true,
        discountPercent: true,
        isActive: true,
        expiresAt: true,
        _count: {
          select: {
            payments: true,
          },
        },
      },
    });

    if (!current) {
      throw new PromoCodeAdminServiceError(
        "Promo code not found.",
        "PROMO_CODE_NOT_FOUND",
      );
    }

    if (input.code !== undefined) {
      let requestedCode: string;

      try {
        requestedCode = validatePromoCodeFormat(input.code);
      } catch (error) {
        if (error instanceof PromoCodeValidationError) {
          throw mapDomainValidationError(error);
        }
        throw error;
      }

      if (requestedCode !== current.code) {
        throw new PromoCodeAdminServiceError(
          "Promo codes cannot be renamed after creation.",
          "CODE_IMMUTABLE",
        );
      }
    }

    if (
      current._count.payments > 0 &&
      discountPercent !== current.discountPercent
    ) {
      throw new PromoCodeAdminServiceError(
        "This promo code has already been used and its discount percentage can no longer be changed.",
        "USED_DISCOUNT_IMMUTABLE",
      );
    }

    const updated = await transaction.promoCode.update({
      where: {
        id: promoCodeId,
      },
      data: {
        discountPercent,
        expiresAt: input.expiresAt,
      },
    });

    await transaction.auditLog.create({
      data: {
        actorUserId: adminUserId,
        entityType: "PromoCode",
        entityId: promoCodeId,
        action: "PROMO_CODE_UPDATED",
        before: toAuditSnapshot(current),
        after: toAuditSnapshot(updated),
      },
    });

    return updated;
  });
}

async function setPromoCodeActiveState(
  adminUserId: string,
  promoCodeId: string,
  isActive: boolean,
) {
  return prisma.$transaction(async (transaction) => {
    await assertAdminExists(transaction, adminUserId);

    const current = await transaction.promoCode.findUnique({
      where: {
        id: promoCodeId,
      },
      select: {
        id: true,
        code: true,
        discountPercent: true,
        isActive: true,
        expiresAt: true,
      },
    });

    if (!current) {
      throw new PromoCodeAdminServiceError(
        "Promo code not found.",
        "PROMO_CODE_NOT_FOUND",
      );
    }

    if (current.isActive === isActive) {
      return current;
    }

    const updated = await transaction.promoCode.update({
      where: {
        id: promoCodeId,
      },
      data: {
        isActive,
      },
    });

    await transaction.auditLog.create({
      data: {
        actorUserId: adminUserId,
        entityType: "PromoCode",
        entityId: promoCodeId,
        action: isActive
          ? "PROMO_CODE_ACTIVATED"
          : "PROMO_CODE_DEACTIVATED",
        before: toAuditSnapshot(current),
        after: toAuditSnapshot(updated),
      },
    });

    return updated;
  });
}

export function activatePromoCode(adminUserId: string, promoCodeId: string) {
  return setPromoCodeActiveState(adminUserId, promoCodeId, true);
}

export function deactivatePromoCode(adminUserId: string, promoCodeId: string) {
  return setPromoCodeActiveState(adminUserId, promoCodeId, false);
}
