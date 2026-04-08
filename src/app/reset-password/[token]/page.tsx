import Link from "next/link";
import { Alert, Card, Layout, Space, Typography } from "antd";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { AUTH_MESSAGES, AUTH_ROUTES } from "@/lib/constants/auth";
import { validatePasswordResetToken } from "@/server/services/auth.service";

const { Content } = Layout;
const { Paragraph, Title } = Typography;

type ResetPasswordPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function ResetPasswordPage({ params }: ResetPasswordPageProps) {
  const { token } = await params;
  const isTokenValid = await validatePasswordResetToken(token);

  return (
    <Layout className="site-shell">
      <Content className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-16 md:px-10">
        <Card className="soft-card w-full max-w-md" bordered={false}>
          <Space direction="vertical" size="large" className="w-full">
            <div>
              <Title level={2}>Reset Password</Title>
              <Paragraph type="secondary">
                Use the secure link you received to set a new password for your Theraply account.
              </Paragraph>
            </div>

            {isTokenValid ? (
              <ResetPasswordForm token={token} />
            ) : (
              <Space direction="vertical" size="middle" className="w-full">
                <Alert type="error" message={AUTH_MESSAGES.resetPasswordInvalidToken} showIcon />
                <Paragraph type="secondary" className="!mb-0">
                  Request a new recovery link from the forgot-password screen or return to login.
                </Paragraph>
                <Paragraph type="secondary" className="!mb-0">
                  <Link href={AUTH_ROUTES.forgotPassword}>Request a new link</Link>
                  {" | "}
                  <Link href={AUTH_ROUTES.login}>Back to login</Link>
                </Paragraph>
              </Space>
            )}
          </Space>
        </Card>
      </Content>
    </Layout>
  );
}
