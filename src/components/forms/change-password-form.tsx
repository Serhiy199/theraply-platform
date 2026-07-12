"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, Button, Form, Input, Space, Typography } from "antd";
import { changePasswordAction } from "@/app/change-password/actions";
import {
  initialChangePasswordActionState,
  type ChangePasswordActionState,
} from "@/app/change-password/state";

const { Paragraph } = Typography;

type ChangePasswordFormProps = {
  role?: string | null;
};

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <Button type="primary" htmlType="submit" block size="large" loading={pending}>
      Change password
    </Button>
  );
}

function getDashboardHref(role?: string | null) {
  switch (role) {
    case "THERAPIST":
      return "/therapist/dashboard";
    case "ADMIN":
      return "/admin/dashboard";
    case "CLIENT":
    default:
      return "/client/dashboard";
  }
}

export function ChangePasswordForm({ role }: ChangePasswordFormProps) {
  const [state, formAction, pending] = useActionState<
    ChangePasswordActionState,
    FormData
  >(changePasswordAction, initialChangePasswordActionState);
  const dashboardHref = getDashboardHref(role);

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
        Enter your current password and choose a new one.{" "}
        <Link href={dashboardHref}>Back to dashboard.</Link>
      </Paragraph>
      <form action={formAction} className="w-full">
        <Form component={false} layout="vertical" requiredMark={false}>
          <Form.Item
            label="Current password"
            validateStatus={state.fieldErrors?.currentPassword ? "error" : undefined}
            help={state.fieldErrors?.currentPassword?.[0]}
          >
            <Input.Password
              name="currentPassword"
              autoComplete="current-password"
              placeholder="Enter your current password"
              size="large"
            />
          </Form.Item>
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
