import { ResetPasswordPanel } from "@/components/forms/reset-password-panel";
import { validatePasswordResetToken } from "@/server/services/auth.service";

type ResetPasswordPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function ResetPasswordPage({ params }: ResetPasswordPageProps) {
  const { token } = await params;
  const isTokenValid = await validatePasswordResetToken(token);

  return <ResetPasswordPanel token={token} isTokenValid={isTokenValid} />;
}
