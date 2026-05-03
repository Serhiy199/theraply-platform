-- AlterEnum
ALTER TABLE "public"."TherapistProfile"
ALTER COLUMN "approvalStatus" DROP DEFAULT;

ALTER TYPE "public"."TherapistApprovalStatus"
RENAME TO "TherapistApprovalStatus_old";

CREATE TYPE "public"."TherapistApprovalStatus" AS ENUM (
    'EMAIL_NOT_VERIFIED',
    'PROFILE_INCOMPLETE',
    'PENDING_REVIEW',
    'APPROVED',
    'REJECTED',
    'SUSPENDED'
);

ALTER TABLE "public"."TherapistProfile"
ALTER COLUMN "approvalStatus" TYPE "public"."TherapistApprovalStatus"
USING (
    CASE "approvalStatus"::text
        WHEN 'PENDING' THEN 'PROFILE_INCOMPLETE'
        ELSE "approvalStatus"::text
    END
)::"public"."TherapistApprovalStatus";

ALTER TABLE "public"."TherapistProfile"
ALTER COLUMN "approvalStatus" SET DEFAULT 'EMAIL_NOT_VERIFIED';

DROP TYPE "public"."TherapistApprovalStatus_old";
