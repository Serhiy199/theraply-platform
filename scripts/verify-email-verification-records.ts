import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function redactToken(token: string) {
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

async function main() {
  const now = new Date();

  const [
    userCount,
    tokenCount,
    emailLogCount,
    activeEmailVerificationTokenCount,
    therapistStatusCounts,
    recentUsers,
    recentEmailVerificationTokens,
    recentEmailLogs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.emailVerificationToken.count(),
    prisma.emailLog.count(),
    prisma.emailVerificationToken.count({
      where: {
        usedAt: null,
        expiresAt: {
          gt: now,
        },
      },
    }),
    prisma.therapistProfile.groupBy({
      by: ["approvalStatus"],
      _count: {
        _all: true,
      },
      orderBy: {
        approvalStatus: "asc",
      },
    }),
    prisma.user.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        emailVerified: true,
        emailVerifiedAt: true,
        createdAt: true,
        clientProfile: {
          select: {
            id: true,
          },
        },
        therapistProfile: {
          select: {
            id: true,
            approvalStatus: true,
            onboardingCompleted: true,
            submittedForReviewAt: true,
            approvedAt: true,
            rejectedAt: true,
          },
        },
      },
    }),
    prisma.emailVerificationToken.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
      select: {
        id: true,
        userId: true,
        token: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
        user: {
          select: {
            email: true,
            role: true,
            emailVerified: true,
          },
        },
      },
    }),
    prisma.emailLog.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
      select: {
        id: true,
        userId: true,
        email: true,
        template: true,
        subject: true,
        status: true,
        sentAt: true,
        failedAt: true,
        errorMessage: true,
        createdAt: true,
      },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        checkedAt: now.toISOString(),
        summary: {
          userCount,
          emailVerificationTokenCount: tokenCount,
          emailLogCount,
          activeEmailVerificationTokenCount,
          therapistStatusCounts: therapistStatusCounts.map((status) => ({
            approvalStatus: status.approvalStatus,
            count: status._count._all,
          })),
        },
        recentUsers,
        recentEmailVerificationTokens: recentEmailVerificationTokens.map((record) => ({
          ...record,
          token: redactToken(record.token),
        })),
        recentEmailLogs,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("[verify-email-verification-records] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
