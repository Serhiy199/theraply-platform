import { PrismaClient, TherapistApprovalStatus } from "@prisma/client";

const prisma = new PrismaClient();

const trackedStatuses = [
  TherapistApprovalStatus.PROFILE_INCOMPLETE,
  TherapistApprovalStatus.PENDING_REVIEW,
  TherapistApprovalStatus.APPROVED,
  TherapistApprovalStatus.REJECTED,
] as const;

const recentProfileSelect = {
  id: true,
  userId: true,
  displayName: true,
  bio: true,
  specialization: true,
  approvalStatus: true,
  isApproved: true,
  onboardingCompleted: true,
  submittedForReviewAt: true,
  approvedAt: true,
  rejectedAt: true,
  rejectionReason: true,
  profileDraft: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      email: true,
      firstName: true,
      lastName: true,
      emailVerified: true,
      isActive: true,
    },
  },
} as const;

async function getStatusCounts() {
  const groupedCounts = await prisma.therapistProfile.groupBy({
    by: ["approvalStatus"],
    _count: {
      _all: true,
    },
    where: {
      approvalStatus: {
        in: [...trackedStatuses],
      },
    },
    orderBy: {
      approvalStatus: "asc",
    },
  });

  const countByStatus = new Map(
    groupedCounts.map((entry) => [entry.approvalStatus, entry._count._all]),
  );

  return Object.fromEntries(
    trackedStatuses.map((status) => [status, countByStatus.get(status) ?? 0]),
  );
}

async function getLifecycleWarnings() {
  const [
    approvedWithInvalidFlags,
    pendingWithoutSubmissionDate,
    rejectedWithoutReviewDetails,
    incompleteAfterCompletedOnboarding,
  ] = await Promise.all([
    prisma.therapistProfile.findMany({
      where: {
        approvalStatus: TherapistApprovalStatus.APPROVED,
        OR: [
          { isApproved: false },
          { onboardingCompleted: false },
          { approvedAt: null },
        ],
      },
      take: 10,
      orderBy: {
        updatedAt: "desc",
      },
      select: recentProfileSelect,
    }),
    prisma.therapistProfile.findMany({
      where: {
        approvalStatus: TherapistApprovalStatus.PENDING_REVIEW,
        submittedForReviewAt: null,
      },
      take: 10,
      orderBy: {
        updatedAt: "desc",
      },
      select: recentProfileSelect,
    }),
    prisma.therapistProfile.findMany({
      where: {
        approvalStatus: TherapistApprovalStatus.REJECTED,
        OR: [{ rejectedAt: null }, { rejectionReason: null }],
      },
      take: 10,
      orderBy: {
        updatedAt: "desc",
      },
      select: recentProfileSelect,
    }),
    prisma.therapistProfile.findMany({
      where: {
        approvalStatus: TherapistApprovalStatus.PROFILE_INCOMPLETE,
        onboardingCompleted: true,
      },
      take: 10,
      orderBy: {
        updatedAt: "desc",
      },
      select: recentProfileSelect,
    }),
  ]);

  return {
    approvedWithInvalidFlags,
    pendingWithoutSubmissionDate,
    rejectedWithoutReviewDetails,
    incompleteAfterCompletedOnboarding,
  };
}

async function main() {
  const checkedAt = new Date();

  const [
    statusCounts,
    recentlySubmittedProfiles,
    recentlyApprovedProfiles,
    recentlyRejectedProfiles,
    lifecycleWarnings,
  ] = await Promise.all([
    getStatusCounts(),
    prisma.therapistProfile.findMany({
      where: {
        submittedForReviewAt: {
          not: null,
        },
      },
      take: 5,
      orderBy: {
        submittedForReviewAt: "desc",
      },
      select: recentProfileSelect,
    }),
    prisma.therapistProfile.findMany({
      where: {
        approvedAt: {
          not: null,
        },
      },
      take: 5,
      orderBy: {
        approvedAt: "desc",
      },
      select: recentProfileSelect,
    }),
    prisma.therapistProfile.findMany({
      where: {
        rejectedAt: {
          not: null,
        },
      },
      take: 5,
      orderBy: {
        rejectedAt: "desc",
      },
      select: recentProfileSelect,
    }),
    getLifecycleWarnings(),
  ]);

  console.log(
    JSON.stringify(
      {
        checkedAt: checkedAt.toISOString(),
        statusCounts,
        recentlySubmittedProfiles,
        recentlyApprovedProfiles,
        recentlyRejectedProfiles,
        lifecycleWarnings,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("[verify-therapist-onboarding] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
