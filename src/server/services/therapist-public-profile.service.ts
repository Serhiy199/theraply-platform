import "server-only";
import { Prisma, TherapistApprovalStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { therapistPublicProfileSchema } from "@/lib/validations/therapist-public-profile";

const publicFields = {
  bio: true, specialization: true, therapyServicesProvided: true, yearsOfExperience: true,
} as const;

function ownApprovedProfile(userId: string) {
  if (!userId) throw new Error("Profile access denied.");
  return {
    userId, approvalStatus: TherapistApprovalStatus.APPROVED, isApproved: true,
    user: { is: { id: userId, role: UserRole.THERAPIST, isActive: true, emailVerified: true } },
  };
}

export async function getTherapistPublicProfile(userId: string) {
  return prisma.therapistProfile.findFirst({
    where: ownApprovedProfile(userId), select: { ...publicFields, profilePhotoUrl: true },
  });
}

export async function updateTherapistPublicProfile(userId: string, input: unknown) {
  const data = therapistPublicProfileSchema.parse(input);
  const where = ownApprovedProfile(userId);
  return prisma.$transaction(async tx => {
    const profile = await tx.therapistProfile.findFirst({ where, select: { id: true, ...publicFields } });
    if (!profile) throw new Error("Profile access denied.");
    const updated = await tx.therapistProfile.updateMany({ where: { ...where, id: profile.id }, data });
    if (updated.count !== 1) throw new Error("Profile access denied.");
    await tx.auditLog.create({ data: {
      actorUserId: userId, entityType: "TherapistProfile", entityId: profile.id,
      action: "THERAPIST_PUBLIC_PROFILE_UPDATED",
      after: { changedFields: Object.keys(data).filter(key => data[key as keyof typeof data] !== profile[key as keyof typeof data]) },
    } });
    return data;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
