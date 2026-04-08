"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSession, signIn } from "next-auth/react";
import { Alert, Button, Form, Input, Space, Typography } from "antd";
import { getDashboardRouteForRole } from "@/lib/auth/redirects";
import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { loginSchema } from "@/lib/validations/auth";

const { Paragraph } = Typography;

type LoginFormProps = {
  callbackUrl?: string;
};

function normalizeRedirectTarget(url: string) {
  const parsedUrl = new URL(url, window.location.origin);
  return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
}

export function LoginForm({ callbackUrl = "/" }: LoginFormProps) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleFinish = (values: { email: string; password: string }) => {
    const parsed = loginSchema.safeParse(values);

    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors);
      setFormError(AUTH_MESSAGES.loginInvalid);
      return;
    }

    setFieldErrors({});
    setFormError(null);

    startTransition(async () => {
      const result = await signIn("credentials", {
        email: parsed.data.email,
        password: parsed.data.password,
        redirect: false,
        callbackUrl,
      });

      if (!result || result.error) {
        setFormError(AUTH_MESSAGES.loginInvalid);
        return;
      }

      let nextRoute = result.url ? normalizeRedirectTarget(result.url) : null;

      if (!nextRoute || nextRoute === "/") {
        const session = await getSession();
        nextRoute = getDashboardRouteForRole(session?.user?.role);
      }

      router.push(nextRoute);
      router.refresh();
    });
  };

  return (
    <Space direction="vertical" size="large" className="w-full">
      {formError ? <Alert type="error" message={formError} showIcon /> : null}
      <Paragraph type="secondary" className="!mb-0">
        Sign in with your email and password to access your Theraply dashboard.
      </Paragraph>
      <Form layout="vertical" onFinish={handleFinish} requiredMark={false}>
        <Form.Item
          label="Email address"
          name="email"
          validateStatus={fieldErrors.email ? "error" : undefined}
          help={fieldErrors.email?.[0]}
        >
          <Input autoComplete="email" placeholder="name@example.com" size="large" />
        </Form.Item>
        <Form.Item
          label="Password"
          name="password"
          validateStatus={fieldErrors.password ? "error" : undefined}
          help={fieldErrors.password?.[0]}
        >
          <Input.Password
            autoComplete="current-password"
            placeholder="Enter your password"
            size="large"
          />
        </Form.Item>
        <Button type="primary" htmlType="submit" block size="large" loading={isPending}>
          Continue
        </Button>
      </Form>
    </Space>
  );
}
