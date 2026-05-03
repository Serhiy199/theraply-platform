import { Prisma, PrismaClient, TherapistApprovalStatus, UserRole } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";

const prisma = new PrismaClient();

const seededEmailVerifiedAt = new Date("2026-04-08T12:00:00.000Z");
const annaSubmittedForReviewAt = new Date("2026-04-08T14:00:00.000Z");
const annaApprovedAt = new Date("2026-04-08T16:00:00.000Z");
const davidSubmittedForReviewAt = new Date("2026-04-08T14:30:00.000Z");
const davidApprovedAt = new Date("2026-04-08T16:30:00.000Z");

async function upsertUser(params: {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  password: string;
}) {
  const passwordHash = await hashPassword(params.password);

  return prisma.user.upsert({
    where: { email: params.email },
    update: {
      firstName: params.firstName,
      lastName: params.lastName,
      role: params.role,
      isActive: true,
      emailVerified: true,
      emailVerifiedAt: seededEmailVerifiedAt,
      passwordHash,
    },
    create: {
      email: params.email,
      firstName: params.firstName,
      lastName: params.lastName,
      role: params.role,
      isActive: true,
      emailVerified: true,
      emailVerifiedAt: seededEmailVerifiedAt,
      passwordHash,
    },
  });
}

async function main() {
  const admin = await upsertUser({
    email: "admin@theraply.local",
    firstName: "Theraply",
    lastName: "Admin",
    role: UserRole.ADMIN,
    password: "Admin123!",
  });

  const therapistOne = await upsertUser({
    email: "therapist.anna@theraply.local",
    firstName: "Anna",
    lastName: "Miller",
    role: UserRole.THERAPIST,
    password: "Therapist123!",
  });

  const therapistTwo = await upsertUser({
    email: "therapist.david@theraply.local",
    firstName: "David",
    lastName: "Brown",
    role: UserRole.THERAPIST,
    password: "Therapist123!",
  });

  const clientOne = await upsertUser({
    email: "client.emma@theraply.local",
    firstName: "Emma",
    lastName: "Taylor",
    role: UserRole.CLIENT,
    password: "Client123!",
  });

  const clientTwo = await upsertUser({
    email: "client.james@theraply.local",
    firstName: "James",
    lastName: "Wilson",
    role: UserRole.CLIENT,
    password: "Client123!",
  });

  await prisma.clientProfile.upsert({
    where: { userId: clientOne.id },
    update: {},
    create: { userId: clientOne.id },
  });

  await prisma.clientProfile.upsert({
    where: { userId: clientTwo.id },
    update: {},
    create: { userId: clientTwo.id },
  });

  const therapistOneProfile = await prisma.therapistProfile.upsert({
    where: { userId: therapistOne.id },
    update: {
      displayName: "Anna Miller, LPC",
      bio: "Trauma-informed therapist focused on stress, burnout, and life transitions.",
      specialization: "Anxiety, burnout, trauma recovery",
      sessionPricePence: 8500,
      approvalStatus: TherapistApprovalStatus.APPROVED,
      isApproved: true,
      onboardingCompleted: true,
      submittedForReviewAt: annaSubmittedForReviewAt,
      approvedAt: annaApprovedAt,
      rejectedAt: null,
      rejectionReason: null,
      profileDraft: Prisma.DbNull,
      googleCalendarId: "anna-miller-theraply",
      googleCalendarEmail: "anna.calendar@theraply.local",
      isGoogleCalendarConnected: true,
      googleCalendarConnectedAt: new Date("2026-04-18T09:00:00.000Z"),
    },
    create: {
      userId: therapistOne.id,
      displayName: "Anna Miller, LPC",
      bio: "Trauma-informed therapist focused on stress, burnout, and life transitions.",
      specialization: "Anxiety, burnout, trauma recovery",
      sessionPricePence: 8500,
      approvalStatus: TherapistApprovalStatus.APPROVED,
      isApproved: true,
      onboardingCompleted: true,
      submittedForReviewAt: annaSubmittedForReviewAt,
      approvedAt: annaApprovedAt,
      rejectedAt: null,
      rejectionReason: null,
      profileDraft: Prisma.DbNull,
      googleCalendarId: "anna-miller-theraply",
      googleCalendarEmail: "anna.calendar@theraply.local",
      isGoogleCalendarConnected: true,
      googleCalendarConnectedAt: new Date("2026-04-18T09:00:00.000Z"),
    },
  });

  const therapistTwoProfile = await prisma.therapistProfile.upsert({
    where: { userId: therapistTwo.id },
    update: {
      displayName: "David Brown, PhD",
      bio: "Therapist working with relationship issues, grief, and long-term emotional resilience.",
      specialization: "Relationships, grief, resilience",
      sessionPricePence: 9500,
      approvalStatus: TherapistApprovalStatus.APPROVED,
      isApproved: true,
      onboardingCompleted: true,
      submittedForReviewAt: davidSubmittedForReviewAt,
      approvedAt: davidApprovedAt,
      rejectedAt: null,
      rejectionReason: null,
      profileDraft: Prisma.DbNull,
      googleCalendarId: "david-brown-theraply",
      googleCalendarEmail: "david.calendar@theraply.local",
      isGoogleCalendarConnected: true,
      googleCalendarConnectedAt: new Date("2026-04-18T09:05:00.000Z"),
    },
    create: {
      userId: therapistTwo.id,
      displayName: "David Brown, PhD",
      bio: "Therapist working with relationship issues, grief, and long-term emotional resilience.",
      specialization: "Relationships, grief, resilience",
      sessionPricePence: 9500,
      approvalStatus: TherapistApprovalStatus.APPROVED,
      isApproved: true,
      onboardingCompleted: true,
      submittedForReviewAt: davidSubmittedForReviewAt,
      approvedAt: davidApprovedAt,
      rejectedAt: null,
      rejectionReason: null,
      profileDraft: Prisma.DbNull,
      googleCalendarId: "david-brown-theraply",
      googleCalendarEmail: "david.calendar@theraply.local",
      isGoogleCalendarConnected: true,
      googleCalendarConnectedAt: new Date("2026-04-18T09:05:00.000Z"),
    },
  });

  await prisma.therapistPayoutDetails.upsert({
    where: { therapistProfileId: therapistOneProfile.id },
    update: {
      accountHolderName: "Anna Miller",
      bankName: "First Therapy Bank",
      iban: "DE89370400440532013000",
      swift: "COBADEFFXXX",
      country: "DE",
      isVerified: true,
    },
    create: {
      therapistProfileId: therapistOneProfile.id,
      accountHolderName: "Anna Miller",
      bankName: "First Therapy Bank",
      iban: "DE89370400440532013000",
      swift: "COBADEFFXXX",
      country: "DE",
      isVerified: true,
    },
  });

  await prisma.therapistPayoutDetails.upsert({
    where: { therapistProfileId: therapistTwoProfile.id },
    update: {
      accountHolderName: "David Brown",
      bankName: "Wellness Credit Union",
      iban: "GB29NWBK60161331926819",
      swift: "NWBKGB2L",
      country: "GB",
      isVerified: true,
    },
    create: {
      therapistProfileId: therapistTwoProfile.id,
      accountHolderName: "David Brown",
      bankName: "Wellness Credit Union",
      iban: "GB29NWBK60161331926819",
      swift: "NWBKGB2L",
      country: "GB",
      isVerified: true,
    },
  });

  await prisma.clientCreditBalance.upsert({
    where: { clientId: clientOne.id },
    update: {
      balance: 0,
      currency: "gbp",
    },
    create: {
      clientId: clientOne.id,
      balance: 0,
      currency: "gbp",
    },
  });

  await prisma.clientCreditBalance.upsert({
    where: { clientId: clientTwo.id },
    update: {
      balance: 0,
      currency: "gbp",
    },
    create: {
      clientId: clientTwo.id,
      balance: 0,
      currency: "gbp",
    },
  });

  console.log("Seed complete");
  console.log({
    admin: admin.email,
    therapists: [therapistOne.email, therapistTwo.email],
    clients: [clientOne.email, clientTwo.email],
    defaultPasswords: {
      admin: "Admin123!",
      therapists: "Therapist123!",
      clients: "Client123!",
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
