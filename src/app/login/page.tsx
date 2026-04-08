import Link from "next/link";
import { Card, Space } from "antd";
import { LoginForm } from "@/components/forms/login-form";
import { AUTH_ROUTES } from "@/lib/constants/auth";

type LoginPageProps = {
  searchParams?: Promise<{
    callbackUrl?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const callbackUrl = resolvedSearchParams?.callbackUrl ?? "/";

  return (
    <main className="site-shell mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-16 md:px-10">
      <Card className="soft-card w-full max-w-md" bordered={false}>
        <Space direction="vertical" size="large" className="w-full">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Login</h1>
            <p className="mt-3 text-base text-slate-600">
              Welcome back. Sign in to continue to your Theraply account.
            </p>
          </div>
          <LoginForm callbackUrl={callbackUrl} />
          <p className="text-center text-sm text-slate-600">
            Need an account? <Link href={AUTH_ROUTES.register}>Register here</Link>
          </p>
        </Space>
      </Card>
    </main>
  );
}
