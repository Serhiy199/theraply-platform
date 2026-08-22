import "server-only";
import {
  ClientCreditTransactionType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAuditLogEntryBestEffort } from "@/server/services/audit-log.service";

type CreditDbClient = Prisma.TransactionClient;

export class ClientCreditServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INSUFFICIENT_CLIENT_CREDIT"
      | "CREDIT_APPLICATION_MISMATCH",
  ) {
    super(message);
    this.name = "ClientCreditServiceError";
  }
}

export async function acquireFinancialTransactionLock(
  tx: CreditDbClient,
  lockKey: string,
) {
  await tx.$queryRaw`
    WITH financial_lock AS (
      SELECT pg_advisory_xact_lock(hashtext(${`theraply:${lockKey}`}))
    )
    SELECT 1::integer AS acquired
    FROM financial_lock
  `;
}

export type ClientCreditTransactionItem = {
  id: string;
  type: ClientCreditTransactionType;
  amount: number;
  currency: string;
  notes: string | null;
  createdAt: Date;
  bookingId: string | null;
  paymentId: string | null;
};

export type ClientCreditSummary = {
  balance: number;
  currency: string;
  recentTransactions: ClientCreditTransactionItem[];
};

async function ensureClientCreditBalance(
  tx: CreditDbClient,
  clientId: string,
  currency = "gbp",
) {
  return tx.clientCreditBalance.upsert({
    where: {
      clientId,
    },
    update: {},
    create: {
      clientId,
      currency,
      balance: 0,
    },
  });
}

export async function getClientCreditSummary(clientId: string): Promise<ClientCreditSummary> {
  const [balance, recentTransactions] = await Promise.all([
    prisma.clientCreditBalance.findUnique({
      where: {
        clientId,
      },
      select: {
        balance: true,
        currency: true,
      },
    }),
    prisma.clientCreditTransaction.findMany({
      where: {
        clientId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 8,
      select: {
        id: true,
        type: true,
        amount: true,
        currency: true,
        notes: true,
        createdAt: true,
        bookingId: true,
        paymentId: true,
      },
    }),
  ]);

  return {
    balance: balance?.balance ?? 0,
    currency: balance?.currency ?? "gbp",
    recentTransactions,
  };
}

export type ApplyClientCreditInput = {
  clientId: string;
  bookingId: string;
  paymentId: string;
  amount: number;
  currency?: string;
  notes?: string | null;
};

export async function applyClientCreditToPaymentInTransaction(
  tx: CreditDbClient,
  input: ApplyClientCreditInput,
) {
  if (input.amount <= 0) {
    return { amount: 0, appliedNow: false };
  }

  await acquireFinancialTransactionLock(tx, `client-credit:${input.clientId}`);

  const applicationEntries = await tx.clientCreditTransaction.findMany({
    where: {
      paymentId: input.paymentId,
      type: {
        in: [
          ClientCreditTransactionType.APPLIED,
          ClientCreditTransactionType.REVERSED,
        ],
      },
    },
    select: {
      amount: true,
      type: true,
    },
  });
  const activeAppliedAmount = applicationEntries.reduce(
    (total, entry) =>
      total +
      (entry.type === ClientCreditTransactionType.APPLIED
        ? entry.amount
        : -entry.amount),
    0,
  );

  if (activeAppliedAmount > 0) {
    if (activeAppliedAmount !== input.amount) {
      throw new ClientCreditServiceError(
        "The existing client credit application does not match the payment snapshot.",
        "CREDIT_APPLICATION_MISMATCH",
      );
    }

    return { amount: activeAppliedAmount, appliedNow: false };
  }

  if (activeAppliedAmount < 0) {
    throw new ClientCreditServiceError(
      "The client credit ledger contains more reversals than applications.",
      "CREDIT_APPLICATION_MISMATCH",
    );
  }

  const balance = await ensureClientCreditBalance(tx, input.clientId, input.currency ?? "gbp");

  if (balance.balance < input.amount) {
    throw new ClientCreditServiceError(
      "The available client credit is lower than the payment snapshot requires.",
      "INSUFFICIENT_CLIENT_CREDIT",
    );
  }

  const updated = await tx.clientCreditBalance.updateMany({
    where: {
      clientId: input.clientId,
      balance: {
        gte: input.amount,
      },
    },
    data: {
      balance: {
        decrement: input.amount,
      },
    },
  });

  if (updated.count !== 1) {
    throw new ClientCreditServiceError(
      "The available client credit changed before it could be applied.",
      "INSUFFICIENT_CLIENT_CREDIT",
    );
  }

  await tx.clientCreditTransaction.create({
    data: {
      clientId: input.clientId,
      bookingId: input.bookingId,
      paymentId: input.paymentId,
      type: ClientCreditTransactionType.APPLIED,
      amount: input.amount,
      currency: input.currency ?? balance.currency,
      notes: input.notes ?? "Applied toward a confirmed session payment.",
    },
  });

  return { amount: input.amount, appliedNow: true };
}

export async function applyClientCreditToPayment(input: ApplyClientCreditInput) {
  const result = await prisma.$transaction((tx) =>
    applyClientCreditToPaymentInTransaction(tx, input),
  );

  if (result.appliedNow) {
    await createAuditLogEntryBestEffort({
      actorUserId: input.clientId,
      entityType: "ClientCreditBalance",
      entityId: input.clientId,
      action: "CLIENT_CREDIT_APPLIED",
      after: {
        bookingId: input.bookingId,
        paymentId: input.paymentId,
        appliedAmount: result.amount,
      },
    });
  }

  return result.amount;
}

export async function reverseClientCreditApplication(input: {
  clientId: string;
  bookingId: string;
  paymentId: string;
  amount: number;
  currency?: string;
  notes?: string | null;
}) {
  if (input.amount <= 0) {
    return 0;
  }

  const result = await prisma.$transaction(async (tx) => {
    await acquireFinancialTransactionLock(tx, `client-credit:${input.clientId}`);

    const applicationEntries = await tx.clientCreditTransaction.findMany({
      where: {
        paymentId: input.paymentId,
        type: {
          in: [
            ClientCreditTransactionType.APPLIED,
            ClientCreditTransactionType.REVERSED,
          ],
        },
      },
      select: {
        amount: true,
        type: true,
      },
    });
    const activeAppliedAmount = applicationEntries.reduce(
      (total, entry) =>
        total +
        (entry.type === ClientCreditTransactionType.APPLIED
          ? entry.amount
          : -entry.amount),
      0,
    );

    if (activeAppliedAmount === 0) {
      return input.amount;
    }

    if (activeAppliedAmount !== input.amount) {
      throw new ClientCreditServiceError(
        "The client credit reversal does not match the original application.",
        "CREDIT_APPLICATION_MISMATCH",
      );
    }

    const balance = await ensureClientCreditBalance(tx, input.clientId, input.currency ?? "gbp");

    await tx.clientCreditBalance.update({
      where: {
        clientId: input.clientId,
      },
      data: {
        balance: {
          increment: input.amount,
        },
      },
    });

    await tx.clientCreditTransaction.create({
      data: {
        clientId: input.clientId,
        bookingId: input.bookingId,
        paymentId: input.paymentId,
        type: ClientCreditTransactionType.REVERSED,
        amount: input.amount,
        currency: input.currency ?? balance.currency,
        notes: input.notes ?? "Credit was restored after an incomplete payment attempt.",
      },
    });

    return input.amount;
  });

  if (result > 0) {
    await createAuditLogEntryBestEffort({
      actorUserId: input.clientId,
      entityType: "ClientCreditBalance",
      entityId: input.clientId,
      action: "CLIENT_CREDIT_REVERSED",
      after: {
        bookingId: input.bookingId,
        paymentId: input.paymentId,
        reversedAmount: result,
      },
    });
  }

  return result;
}

export async function issueClientCredit(input: {
  clientId: string;
  bookingId?: string | null;
  paymentId?: string | null;
  amount: number;
  currency?: string;
  notes?: string | null;
  actorUserId?: string | null;
}) {
  if (input.amount <= 0) {
    return 0;
  }

  const result = await prisma.$transaction((tx) =>
    issueClientCreditInTransaction(tx, input),
  );

  if (result.issuedNow) {
    await createAuditLogEntryBestEffort({
      actorUserId: input.actorUserId ?? null,
      entityType: "ClientCreditBalance",
      entityId: input.clientId,
      action: "CLIENT_CREDIT_ISSUED",
      after: {
        bookingId: input.bookingId ?? null,
        paymentId: input.paymentId ?? null,
        issuedAmount: result.amount,
      },
    });
  }

  return result.amount;
}

export async function issueClientCreditInTransaction(
  tx: CreditDbClient,
  input: {
    clientId: string;
    bookingId?: string | null;
    paymentId?: string | null;
    amount: number;
    currency?: string;
    notes?: string | null;
  },
) {
  if (input.amount <= 0) {
    return { amount: 0, issuedNow: false };
  }

  await acquireFinancialTransactionLock(tx, `client-credit:${input.clientId}`);

  const existingIssue = input.paymentId
    ? await tx.clientCreditTransaction.findFirst({
        where: {
          paymentId: input.paymentId,
          type: ClientCreditTransactionType.ISSUED,
        },
        select: {
          amount: true,
        },
      })
    : null;

  if (existingIssue) {
    if (existingIssue.amount !== input.amount) {
      throw new ClientCreditServiceError(
        "The existing client credit issue does not match the requested amount.",
        "CREDIT_APPLICATION_MISMATCH",
      );
    }

    return { amount: existingIssue.amount, issuedNow: false };
  }

  const balance = await ensureClientCreditBalance(tx, input.clientId, input.currency ?? "gbp");

  await tx.clientCreditBalance.update({
    where: {
      clientId: input.clientId,
    },
    data: {
      balance: {
        increment: input.amount,
      },
    },
  });

  await tx.clientCreditTransaction.create({
    data: {
      clientId: input.clientId,
      bookingId: input.bookingId ?? null,
      paymentId: input.paymentId ?? null,
      type: ClientCreditTransactionType.ISSUED,
      amount: input.amount,
      currency: input.currency ?? balance.currency,
      notes: input.notes ?? "Platform credit was issued.",
    },
  });

  return { amount: input.amount, issuedNow: true };
}
