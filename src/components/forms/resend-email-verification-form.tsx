"use client";

import { useActionState } from "react";
import { Alert, Button, Form, Input, Space } from "antd";
import { resendEmailVerificationAction } from "@/app/verify-email/actions";
import {
  initialResendEmailVerificationActionState,
  type ResendEmailVerificationActionState,
} from "@/app/verify-email/state";

type ResendEmailVerificationFormProps = {
  showEmailField?: boolean;
};

export function ResendEmailVerificationForm({
  showEmailField = false,
}: ResendEmailVerificationFormProps) {
  const [state, formAction, pending] = useActionState<
    ResendEmailVerificationActionState,
    FormData
  >(resendEmailVerificationAction, initialResendEmailVerificationActionState);

  return (
    <Space direction="vertical" size="middle" className="w-full">
      {state.status === "success" ? (
        <Alert type="success" message={state.message} showIcon />
      ) : null}
      {state.status === "error" ? <Alert type="error" message={state.message} showIcon /> : null}

      <Form action={formAction} layout="vertical" requiredMark={false}>
        {showEmailField ? (
          <Form.Item
            label="Email address"
            name="email"
            validateStatus={state.fieldErrors?.email ? "error" : undefined}
            help={state.fieldErrors?.email?.[0]}
          >
            <Input autoComplete="email" placeholder="name@example.com" size="large" />
          </Form.Item>
        ) : null}

        <Button htmlType="submit" type="primary" loading={pending}>
          Resend verification email
        </Button>
      </Form>
    </Space>
  );
}
