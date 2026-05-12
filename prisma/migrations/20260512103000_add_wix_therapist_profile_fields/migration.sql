-- AlterTable
ALTER TABLE "public"."TherapistProfile"
ADD COLUMN "gender" TEXT,
ADD COLUMN "contactNumber" TEXT,
ADD COLUMN "therapyServicesProvided" TEXT,
ADD COLUMN "yearsOfExperience" TEXT,
ADD COLUMN "educationAndCertifications" TEXT,
ADD COLUMN "specialisation" TEXT,
ADD COLUMN "pricePerHour" TEXT;

-- CreateTable
CREATE TABLE "public"."TherapistCertificate" (
    "id" TEXT NOT NULL,
    "therapistProfileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TherapistCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TherapistProfile_gender_idx" ON "public"."TherapistProfile"("gender");

-- CreateIndex
CREATE INDEX "TherapistCertificate_therapistProfileId_idx" ON "public"."TherapistCertificate"("therapistProfileId");

-- CreateIndex
CREATE INDEX "TherapistCertificate_storageProvider_idx" ON "public"."TherapistCertificate"("storageProvider");

-- CreateIndex
CREATE INDEX "TherapistCertificate_uploadedAt_idx" ON "public"."TherapistCertificate"("uploadedAt");

-- CreateIndex
CREATE INDEX "TherapistCertificate_therapistProfileId_uploadedAt_idx" ON "public"."TherapistCertificate"("therapistProfileId", "uploadedAt");

-- AddForeignKey
ALTER TABLE "public"."TherapistCertificate" ADD CONSTRAINT "TherapistCertificate_therapistProfileId_fkey" FOREIGN KEY ("therapistProfileId") REFERENCES "public"."TherapistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
