import "server-only";
import {
  ClientCreditTransactionType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAuditLogEntryBestEffort } from "@/server/services/audit-log.service";

type CreditDbClient = Prisma.TransactionClient;

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

export async function applyClientCreditToPayment(input: {
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
    const balance = await ensureClientCreditBalance(tx, input.clientId, input.currency ?? "gbp");
    const applicableAmount = Math.min(balance.balance, input.amount);

    if (applicableAmount <= 0) {
      return 0;
    }

    await tx.clientCreditBalance.update({
      where: {
        clientId: input.clientId,
      },
      data: {
        balance: {
          decrement: applicableAmount,
        },
      },
    });

    await tx.clientCreditTransaction.create({
      data: {
        clientId: input.clientId,
        bookingId: input.bookingId,
        paymentId: input.paymentId,
        type: ClientCreditTransactionType.APPLIED,
        amount: applicableAmount,
        currency: input.currency ?? balance.currency,
        notes: input.notes ?? "Applied toward a confirmed session payment.",
      },
    });

    return applicableAmount;
  });

  if (result > 0) {
    await createAuditLogEntryBestEffort({
      actorUserId: input.clientId,
      entityType: "ClientCreditBalance",
      entityId: input.clientId,
      action: "CLIENT_CREDIT_APPLIED",
      after: {
        bookingId: input.bookingId,
        paymentId: input.paymentId,
        appliedAmount: result,
      },
    });
  }

  return result;
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
    const existingReversal = await tx.clientCreditTransaction.findFirst({
      where: {
        paymentId: input.paymentId,
        type: ClientCreditTransactionType.REVERSED,
      },
      select: {
        amount: true,
      },
    });

    if (existingReversal) {
      return existingReversal.amount;
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

  const result = await prisma.$transaction(async (tx) => {
    const existingIssue =
      input.paymentId
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
      return existingIssue.amount;
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

    return input.amount;
  });

  if (result > 0) {
    await createAuditLogEntryBestEffort({
      actorUserId: input.actorUserId ?? null,
      entityType: "ClientCreditBalance",
      entityId: input.clientId,
      action: "CLIENT_CREDIT_ISSUED",
      after: {
        bookingId: input.bookingId ?? null,
        paymentId: input.paymentId ?? null,
        issuedAmount: result,
      },
    });
  }

  return result;
}
