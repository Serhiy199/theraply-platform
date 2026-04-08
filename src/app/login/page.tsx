import Link from "next/link";
import { Card, Layout, Space, Typography } from "antd";
import { LoginForm } from "@/components/forms/login-form";
import { AUTH_ROUTES } from "@/lib/constants/auth";

const { Content } = Layout;
const { Paragraph, Title } = Typography;

type LoginPageProps = {
  searchParams?: Promise<{
    callbackUrl?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const callbackUrl = resolvedSearchParams?.callbackUrl ?? "/";

  return (
    <Layout className="site-shell">
      <Content className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-16 md:px-10">
        <Card className="soft-card w-full max-w-md" bordered={false}>
          <Space direction="vertical" size="large" className="w-full">
            <div>
              <Title level={2}>Login</Title>
              <Paragraph type="secondary">
                Welcome back. Sign in to continue to your Theraply account.
              </Paragraph>
            </div>
            <LoginForm callbackUrl={callbackUrl} />
            <Paragraph type="secondary" className="!mb-0 text-center">
              Need an account? <Link href={AUTH_ROUTES.register}>Register here</Link>
            </Paragraph>
          </Space>
        </Card>
      </Content>
    </Layout>
  );
}
