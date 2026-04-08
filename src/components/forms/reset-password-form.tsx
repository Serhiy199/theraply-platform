"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, Button, Form, Input, Space, Typography } from "antd";
import { AUTH_ROUTES } from "@/lib/constants/auth";
import {
  initialResetPasswordActionState,
  resetPasswordAction,
  type ResetPasswordActionState,
} from "@/app/reset-password/[token]/actions";

const { Paragraph } = Typography;

type ResetPasswordFormProps = {
  token: string;
};

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <Button type="primary" htmlType="submit" block size="large" loading={pending}>
      Update password
    </Button>
  );
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [state, formAction, pending] = useActionState<ResetPasswordActionState, FormData>(
    resetPasswordAction,
    initialResetPasswordActionState,
  );

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
        Set a new password for your Theraply account. After saving, you can return to the sign-in screen.
        {" "}
        <Link href={AUTH_ROUTES.login}>Back to login.</Link>
      </Paragraph>
      <form action={formAction} className="w-full">
        <input type="hidden" name="token" value={token} />
        <Form layout="vertical" requiredMark={false}>
          <Form.Item
            label="New password"
            validateStatus={state.fieldErrors?.password ? "error" : undefined}
            help={state.fieldErrors?.password?.[0]}
          >
            <Input.Password
              name="password"
              autoComplete="new-password"
              placeholder="Create a new password"
              size="large"
            />
          </Form.Item>
          <Form.Item
            label="Confirm new password"
            validateStatus={state.fieldErrors?.confirmPassword ? "error" : undefined}
            help={state.fieldErrors?.confirmPassword?.[0]}
          >
            <Input.Password
              name="confirmPassword"
              autoComplete="new-password"
              placeholder="Repeat your new password"
              size="large"
            />
          </Form.Item>
          <SubmitButton pending={pending} />
        </Form>
      </form>
    </Space>
  );
}
