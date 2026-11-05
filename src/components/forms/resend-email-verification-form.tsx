"use client";

import { useActionState, useEffect, useRef } from "react";
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
  const submitting = useRef(false);
  const [state, formAction, pending] = useActionState<
    ResendEmailVerificationActionState,
    FormData
  >(resendEmailVerificationAction, initialResendEmailVerificationActionState);

  useEffect(() => {
    if (!pending) submitting.current = false;
  }, [pending, state]);

  return (
    <Space direction="vertical" size="middle" className="w-full">
      {state.status === "success" ? (
        <Alert type="success" message={state.message} showIcon />
      ) : null}
      {state.status === "error" ? <Alert type="error" message={state.message} showIcon /> : null}

      <form
        action={formAction}
        className="w-full"
        onSubmit={(event) => {
          if (submitting.current || pending) {
            event.preventDefault();
            return;
          }
          submitting.current = true;
        }}
      >
        <Form component={false} layout="vertical" requiredMark={false}>
          {showEmailField ? (
            <Form.Item
              label="Email address"
              validateStatus={state.fieldErrors?.email ? "error" : undefined}
              help={state.fieldErrors?.email?.[0]}
            >
              <Input name="email" autoComplete="email" placeholder="name@example.com" size="large" />
            </Form.Item>
          ) : null}

          <Button htmlType="submit" type="primary" loading={pending} disabled={pending}>
            Resend verification email
          </Button>
        </Form>
      </form>
    </Space>
  );
}
