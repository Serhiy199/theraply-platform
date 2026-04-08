"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, Button, Form, Input, Space, Typography } from "antd";
import { AUTH_ROUTES } from "@/lib/constants/auth";
import {
  initialRegisterActionState,
  registerAction,
  type RegisterActionState,
} from "@/app/register/actions";

const { Paragraph } = Typography;

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <Button type="primary" htmlType="submit" block size="large" loading={pending}>
      Create account
    </Button>
  );
}

export function RegisterForm() {
  const [state, formAction, pending] = useActionState<RegisterActionState, FormData>(
    registerAction,
    initialRegisterActionState,
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
        Create a client account to start booking sessions on Theraply.
        {state.status === "success" ? (
          <>
            {" "}
            <Link href={AUTH_ROUTES.login}>Go to login.</Link>
          </>
        ) : null}
      </Paragraph>
      <form action={formAction} className="w-full">
        <Form component={false} layout="vertical" requiredMark={false}>
          <Form.Item
            label="First name"
            validateStatus={state.fieldErrors?.firstName ? "error" : undefined}
            help={state.fieldErrors?.firstName?.[0]}
          >
            <Input name="firstName" autoComplete="given-name" placeholder="First name" size="large" />
          </Form.Item>
          <Form.Item
            label="Last name"
            validateStatus={state.fieldErrors?.lastName ? "error" : undefined}
            help={state.fieldErrors?.lastName?.[0]}
          >
            <Input name="lastName" autoComplete="family-name" placeholder="Last name" size="large" />
          </Form.Item>
          <Form.Item
            label="Email address"
            validateStatus={state.fieldErrors?.email ? "error" : undefined}
            help={state.fieldErrors?.email?.[0]}
          >
            <Input name="email" autoComplete="email" placeholder="name@example.com" size="large" />
          </Form.Item>
          <Form.Item
            label="Password"
            validateStatus={state.fieldErrors?.password ? "error" : undefined}
            help={state.fieldErrors?.password?.[0]}
          >
            <Input.Password
              name="password"
              autoComplete="new-password"
              placeholder="Create a password"
              size="large"
            />
          </Form.Item>
          <Form.Item
            label="Confirm password"
            validateStatus={state.fieldErrors?.confirmPassword ? "error" : undefined}
            help={state.fieldErrors?.confirmPassword?.[0]}
          >
            <Input.Password
              name="confirmPassword"
              autoComplete="new-password"
              placeholder="Repeat your password"
              size="large"
            />
          </Form.Item>
          <SubmitButton pending={pending} />
        </Form>
      </form>
    </Space>
  );
}
