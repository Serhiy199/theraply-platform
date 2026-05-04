import Link from "next/link";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { Alert, Card, Layout, Space, Typography } from "antd";
import { AUTH_MESSAGES, AUTH_ROUTES, DASHBOARD_ROUTES } from "@/lib/constants/auth";
import {
  EmailVerificationServiceError,
  verifyEmailToken,
} from "@/server/services/email-verification.service";

const { Content } = Layout;
const { Paragraph, Title } = Typography;

const THERAPIST_ONBOARDING_ROUTE = "/therapist/onboarding";

type VerifyEmailPageProps = {
  params: Promise<{
    token: string;
  }>;
};

function getVerificationRedirectForRole(role: UserRole) {
  switch (role) {
    case UserRole.CLIENT:
      return DASHBOARD_ROUTES.client;
    case UserRole.THERAPIST:
      return THERAPIST_ONBOARDING_ROUTE;
    case UserRole.ADMIN:
      return DASHBOARD_ROUTES.admin;
    default:
      return AUTH_ROUTES.login;
  }
}

function VerifyEmailErrorState({ message }: { message: string }) {
  return (
    <Layout className="site-shell">
      <Content className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-16 md:px-10">
        <Card className="soft-card w-full max-w-md" bordered={false}>
          <Space direction="vertical" size="large" className="w-full">
            <div>
              <Title level={2}>Email verification</Title>
              <Paragraph type="secondary">
                We could not verify your email address with this link.
              </Paragraph>
            </div>
            <Alert type="error" message={message} showIcon />
            <Paragraph type="secondary" className="!mb-0">
              Please return to login or register again if this account was not completed.
            </Paragraph>
            <Paragraph type="secondary" className="!mb-0">
              <Link href={AUTH_ROUTES.login}>Back to login</Link>
              {" | "}
              <Link href={AUTH_ROUTES.register}>Register</Link>
            </Paragraph>
          </Space>
        </Card>
      </Content>
    </Layout>
  );
}

export default async function VerifyEmailPage({ params }: VerifyEmailPageProps) {
  const { token } = await params;
  let redirectTo: string;

  try {
    const result = await verifyEmailToken(token);
    redirectTo = getVerificationRedirectForRole(result.role);
  } catch (error) {
    if (error instanceof EmailVerificationServiceError) {
      return <VerifyEmailErrorState message={error.message} />;
    }

    return (
      <VerifyEmailErrorState
        message={AUTH_MESSAGES.emailVerificationGenericError}
      />
    );
  }

  redirect(redirectTo);
}
