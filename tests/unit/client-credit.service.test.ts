import { ClientCreditTransactionType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyClientCreditToPayment,
  ClientCreditServiceError,
  reverseClientCreditApplication,
} from "@/server/services/client-credit.service";

const transactionMock = vi.hoisted(() => vi.fn());
const auditMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transactionMock,
  },
}));

vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: auditMock,
}));

type LedgerEntry = {
  paymentId: string;
  type: ClientCreditTransactionType;
  amount: number;
};

let balance: number;
let ledger: LedgerEntry[];
let tx: Record<string, unknown>;

function configureTransactionState(initialBalance = 5000) {
  balance = initialBalance;
  ledger = [];

  tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
    clientCreditBalance: {
      upsert: vi.fn(async () => ({ balance, currency: "gbp" })),
      updateMany: vi.fn(async ({ where, data }) => {
        const requested = data.balance.decrement as number;
        if (balance < where.balance.gte) return { count: 0 };
        balance -= requested;
        return { count: 1 };
      }),
      update: vi.fn(async ({ data }) => {
        balance += data.balance.increment as number;
        return { balance };
      }),
    },
    clientCreditTransaction: {
      findMany: vi.fn(async ({ where }) =>
        ledger.filter(
          (entry) =>
            entry.paymentId === where.paymentId &&
            where.type.in.includes(entry.type),
        ),
      ),
      findFirst: vi.fn(async ({ where }) =>
        ledger.find(
          (entry) => entry.paymentId === where.paymentId && entry.type === where.type,
        ) ?? null,
      ),
      create: vi.fn(async ({ data }) => {
        ledger.push({
          paymentId: data.paymentId,
          type: data.type,
          amount: data.amount,
        });
        return data;
      }),
    },
  };

  let queue = Promise.resolve();
  transactionMock.mockImplementation((callback: (client: typeof tx) => unknown) => {
    const result = queue.then(() => callback(tx));
    queue = result.then(() => undefined, () => undefined);
    return result;
  });
}

const creditInput = {
  clientId: "client-id",
  bookingId: "booking-id",
  paymentId: "payment-id",
  amount: 2000,
  currency: "gbp",
};

beforeEach(() => {
  vi.clearAllMocks();
  configureTransactionState();
});

describe("client credit application", () => {
  it("applies the exact requested amount", async () => {
    await expect(applyClientCreditToPayment(creditInput)).resolves.toBe(2000);

    expect(balance).toBe(3000);
    expect(ledger).toEqual([
      expect.objectContaining({
        type: ClientCreditTransactionType.APPLIED,
        amount: 2000,
      }),
    ]);
  });

  it("treats a duplicate active application as idempotent", async () => {
    await applyClientCreditToPayment(creditInput);
    await applyClientCreditToPayment(creditInput);

    expect(balance).toBe(3000);
    expect(ledger.filter((entry) => entry.type === ClientCreditTransactionType.APPLIED)).toHaveLength(1);
  });

  it("serializes concurrent applications and debits once", async () => {
    const results = await Promise.all([
      applyClientCreditToPayment(creditInput),
      applyClientCreditToPayment(creditInput),
    ]);

    expect(results).toEqual([2000, 2000]);
    expect(balance).toBe(3000);
    expect(ledger.filter((entry) => entry.type === ClientCreditTransactionType.APPLIED)).toHaveLength(1);
  });

  it("fails instead of silently applying less credit", async () => {
    configureTransactionState(1500);

    await expect(applyClientCreditToPayment(creditInput)).rejects.toMatchObject({
      code: "INSUFFICIENT_CLIENT_CREDIT",
    } satisfies Partial<ClientCreditServiceError>);
    expect(balance).toBe(1500);
    expect(ledger).toHaveLength(0);
  });

  it("reverses once and permits a later checkout attempt", async () => {
    await applyClientCreditToPayment(creditInput);
    await reverseClientCreditApplication(creditInput);
    await reverseClientCreditApplication(creditInput);
    await applyClientCreditToPayment(creditInput);

    expect(balance).toBe(3000);
    expect(ledger.map((entry) => entry.type)).toEqual([
      ClientCreditTransactionType.APPLIED,
      ClientCreditTransactionType.REVERSED,
      ClientCreditTransactionType.APPLIED,
    ]);
  });
});
