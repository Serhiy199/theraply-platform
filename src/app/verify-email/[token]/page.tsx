import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Button, Card, Layout, Space, Typography } from "antd";
import { ResendEmailVerificationForm } from "@/components/forms/resend-email-verification-form";
import { getPostLoginRedirectForUser } from "@/lib/auth/redirects";
import { AUTH_MESSAGES, AUTH_ROUTES } from "@/lib/constants/auth";
import {
  EmailVerificationServiceError,
  verifyEmailToken,
  type EmailVerificationResult,
} from "@/server/services/email-verification.service";

const { Content } = Layout;
const { Paragraph, Title } = Typography;

type VerifyEmailPageProps = {
  params: Promise<{
    token: string;
  }>;
};

type VerifyEmailState = {
  tone: "success" | "info" | "error";
  title: string;
  description: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
  showResend?: boolean;
};

function getRedirectForVerificationResult(result: EmailVerificationResult) {
  return getPostLoginRedirectForUser({
    role: result.role,
    emailVerified: true,
    therapistApprovalStatus: result.therapistApprovalStatus,
  });
}

function getErrorState(error: EmailVerificationServiceError): VerifyEmailState {
  if (error.code === "TOKEN_EXPIRED" || error.code === "TOKEN_USED") {
    return {
      tone: "error",
      title: "Verification link unavailable",
      description: "This verification link is invalid or has expired.",
      message: "Request a new verification email and use the latest link we send you.",
      showResend: true,
    };
  }

  return {
    tone: "error",
    title: "Verification link unavailable",
    description: "This verification link is invalid or has expired.",
    message: error.code === "TOKEN_NOT_FOUND"
      ? AUTH_MESSAGES.emailVerificationInvalidToken
      : AUTH_MESSAGES.emailVerificationGenericError,
    showResend: true,
  };
}

function VerifyEmailStateCard({ state }: { state: VerifyEmailState }) {
  return (
    <Layout className="site-shell">
      <Content className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-16 md:px-10">
        <Card className="soft-card w-full max-w-md" bordered={false}>
          <Space direction="vertical" size="large" className="w-full">
            <div>
              <Title level={2}>{state.title}</Title>
              <Paragraph type="secondary">{state.description}</Paragraph>
            </div>
            <Alert type={state.tone} message={state.message} showIcon />
            {state.actionHref && state.actionLabel ? (
              <Button type="primary" href={state.actionHref}>
                {state.actionLabel}
              </Button>
            ) : null}
            {state.showResend ? <ResendEmailVerificationForm showEmailField /> : null}
            <Paragraph type="secondary" className="!mb-0">
              <Link href={AUTH_ROUTES.login}>Back to login</Link>
            </Paragraph>
          </Space>
        </Card>
      </Content>
    </Layout>
  );
}

export default async function VerifyEmailPage({ params }: VerifyEmailPageProps) {
  const { token } = await params;
  let redirectTo: string | null = null;

  try {
    const result = await verifyEmailToken(token);
    redirectTo = getRedirectForVerificationResult(result);

    if (result.status === "already_verified") {
      return (
        <VerifyEmailStateCard
          state={{
            tone: "info",
            title: "Email already verified",
            description: "Your Theraply email address is already confirmed.",
            message: "You can continue to your workspace.",
            actionHref: redirectTo,
            actionLabel: "Continue",
          }}
        />
      );
    }
  } catch (error) {
    if (error instanceof EmailVerificationServiceError) {
      return <VerifyEmailStateCard state={getErrorState(error)} />;
    }

    return (
      <VerifyEmailStateCard
        state={{
          tone: "error",
          title: "Email verification",
          description: "We could not verify your email address with this link.",
          message: AUTH_MESSAGES.emailVerificationGenericError,
          showResend: true,
        }}
      />
    );
  }

  redirect(redirectTo);
}
