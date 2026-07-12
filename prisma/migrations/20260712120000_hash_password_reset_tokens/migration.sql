-- Existing password reset links are invalidated because raw tokens are no longer stored.
DELETE FROM "public"."PasswordResetToken";

DROP INDEX IF EXISTS "PasswordResetToken_token_key";

ALTER TABLE "public"."PasswordResetToken"
  DROP COLUMN "token",
  ADD COLUMN "tokenHash" TEXT NOT NULL;

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "public"."PasswordResetToken"("tokenHash");
