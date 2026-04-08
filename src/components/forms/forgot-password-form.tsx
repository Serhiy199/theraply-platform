"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, Button, Form, Input, Space, Typography } from "antd";
import { AUTH_ROUTES } from "@/lib/constants/auth";
import {
  forgotPasswordAction,
  initialForgotPasswordActionState,
  type ForgotPasswordActionState,
} from "@/app/forgot-password/actions";

const { Paragraph } = Typography;

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <Button type="primary" htmlType="submit" block size="large" loading={pending}>
      Send reset link
    </Button>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<
    ForgotPasswordActionState,
    FormData
  >(forgotPasswordAction, initialForgotPasswordActionState);

  return (
    <Space direction="vertical" size="large" className="w-full">
      {state.message ? (
        <Alert
          type={state.status === "success" ? "success" : "error"}
          message={state.message}
          showIcon
        />
      ) : null}
      <Paragraph type="secondary" className="!mb-0">
        Enter the email linked to your account and we will prepare a password reset link.
        <>
          {" "}
          <Link href={AUTH_ROUTES.login}>Back to login.</Link>
        </>
      </Paragraph>
      <form action={formAction} className="w-full">
        <Form layout="vertical" requiredMark={false}>
          <Form.Item
            label="Email address"
            validateStatus={state.fieldErrors?.email ? "error" : undefined}
            help={state.fieldErrors?.email?.[0]}
          >
            <Input name="email" autoComplete="email" placeholder="name@example.com" size="large" />
          </Form.Item>
          <SubmitButton pending={pending} />
        </Form>
      </form>
    </Space>
  );
}
