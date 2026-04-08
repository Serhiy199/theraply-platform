"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, Button, Card, Form, Input, Layout, Space, Typography } from "antd";
import {
  forgotPasswordAction,
  initialForgotPasswordActionState,
  type ForgotPasswordActionState,
} from "@/app/forgot-password/actions";
import { AUTH_ROUTES } from "@/lib/constants/auth";

const { Content } = Layout;
const { Paragraph, Title } = Typography;

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <Button type="primary" htmlType="submit" block size="large" loading={pending}>
      Send reset link
    </Button>
  );
}

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<
    ForgotPasswordActionState,
    FormData
  >(forgotPasswordAction, initialForgotPasswordActionState);

  return (
    <Layout className="site-shell">
      <Content className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-16 md:px-10">
        <Card className="soft-card w-full max-w-md" bordered={false}>
          <Space direction="vertical" size="large" className="w-full">
            <div>
              <Title level={2}>Forgot Password</Title>
              <Paragraph type="secondary">
                Recover access to your Theraply account by requesting a secure reset link.
              </Paragraph>
            </div>
            {state.message ? (
              <Alert
                type={state.status === "success" ? "success" : "error"}
                message={state.message}
                showIcon
              />
            ) : null}
            <Paragraph type="secondary" className="!mb-0">
              Enter the email linked to your account and we will prepare a password reset link.{" "}
              <Link href={AUTH_ROUTES.login}>Back to login.</Link>
            </Paragraph>
            <form action={formAction} className="w-full">
              <Form layout="vertical" requiredMark={false}>
                <Form.Item
                  label="Email address"
                  validateStatus={state.fieldErrors?.email ? "error" : undefined}
                  help={state.fieldErrors?.email?.[0]}
                >
                  <Input
                    name="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    size="large"
                  />
                </Form.Item>
                <SubmitButton pending={pending} />
              </Form>
            </form>
          </Space>
        </Card>
      </Content>
    </Layout>
  );
}
