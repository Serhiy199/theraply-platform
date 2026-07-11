ALTER TABLE "public"."TherapistProfile"
  ADD COLUMN "profilePhotoUrl" TEXT,
  ADD COLUMN "profilePhotoPublicId" TEXT,
  ADD COLUMN "profilePhotoUploadedAt" TIMESTAMP(3);
