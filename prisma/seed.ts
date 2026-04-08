import { PrismaClient, TherapistApprovalStatus, UserRole } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";

const prisma = new PrismaClient();

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
      passwordHash,
    },
    create: {
      email: params.email,
      firstName: params.firstName,
      lastName: params.lastName,
      role: params.role,
      isActive: true,
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
      approvalStatus: TherapistApprovalStatus.APPROVED,
      isApproved: true,
      googleCalendarId: "anna-miller-theraply",
      googleCalendarEmail: "anna.calendar@theraply.local",
    },
    create: {
      userId: therapistOne.id,
      displayName: "Anna Miller, LPC",
      bio: "Trauma-informed therapist focused on stress, burnout, and life transitions.",
      specialization: "Anxiety, burnout, trauma recovery",
      approvalStatus: TherapistApprovalStatus.APPROVED,
      isApproved: true,
      googleCalendarId: "anna-miller-theraply",
      googleCalendarEmail: "anna.calendar@theraply.local",
    },
  });

  const therapistTwoProfile = await prisma.therapistProfile.upsert({
    where: { userId: therapistTwo.id },
    update: {
      displayName: "David Brown, PhD",
      bio: "Therapist working with relationship issues, grief, and long-term emotional resilience.",
      specialization: "Relationships, grief, resilience",
      approvalStatus: TherapistApprovalStatus.APPROVED,
      isApproved: true,
      googleCalendarId: "david-brown-theraply",
      googleCalendarEmail: "david.calendar@theraply.local",
    },
    create: {
      userId: therapistTwo.id,
      displayName: "David Brown, PhD",
      bio: "Therapist working with relationship issues, grief, and long-term emotional resilience.",
      specialization: "Relationships, grief, resilience",
      approvalStatus: TherapistApprovalStatus.APPROVED,
      isApproved: true,
      googleCalendarId: "david-brown-theraply",
      googleCalendarEmail: "david.calendar@theraply.local",
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
