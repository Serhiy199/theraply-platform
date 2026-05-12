"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Alert, Button, Form, Input, Modal, Radio, Space, Typography } from "antd";
import { AUTH_MESSAGES, AUTH_ROUTES } from "@/lib/constants/auth";
import { registerAction } from "@/app/register/actions";
import {
  initialRegisterActionState,
  type RegisterActionState,
} from "@/app/register/state";

const { Paragraph } = Typography;

type SignupRole = "CLIENT" | "THERAPIST";

function getInboxUrl(email?: string) {
  const domain = email?.split("@")[1]?.toLowerCase();

  if (!domain) {
    return "mailto:";
  }

  if (domain === "gmail.com" || domain === "googlemail.com") {
    return "https://mail.google.com/mail/u/0/#inbox";
  }

  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) {
    return "https://outlook.live.com/mail/0/inbox";
  }

  if (domain === "yahoo.com") {
    return "https://mail.yahoo.com/";
  }

  return `mailto:${email}`;
}

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <Button type="primary" htmlType="submit" block size="large" loading={pending}>
      Create account
    </Button>
  );
}

export function RegisterForm() {
  const [role, setRole] = useState<SignupRole>("CLIENT");
  const [state, formAction, pending] = useActionState<RegisterActionState, FormData>(
    registerAction,
    initialRegisterActionState,
  );
  const successNextStep =
    role === "THERAPIST"
      ? AUTH_MESSAGES.registerSuccessTherapistNext
      : AUTH_MESSAGES.registerSuccessClientNext;

  return (
    <Space direction="vertical" size="large" className="w-full">
      <Modal
        title={AUTH_MESSAGES.registerSuccessModalTitle}
        open={state.status === "success"}
        footer={[
          <Button key="inbox" type="primary" href={getInboxUrl(state.email)} target="_blank">
            Open Email
          </Button>,
        ]}
        closable={false}
        maskClosable={false}
      >
        <Paragraph>{state.message ?? AUTH_MESSAGES.registerSuccess}</Paragraph>
        <Paragraph type="secondary" className="!mb-0">
          {AUTH_MESSAGES.registerSuccessModalBody} {successNextStep}
        </Paragraph>
      </Modal>
      {state.status === "error" && state.message ? (
        <Alert
          type="error"
          message={state.message}
          showIcon
        />
      ) : null}
      <Paragraph type="secondary" className="!mb-0">
        Create an account as a client or therapist to continue with Theraply.
      </Paragraph>
      <form action={formAction} className="w-full">
        <input type="hidden" name="role" value={role} />
        <Form component={false} layout="vertical" requiredMark={false}>
          <Form.Item
            label="Account type"
            validateStatus={state.fieldErrors?.role ? "error" : undefined}
            help={state.fieldErrors?.role?.[0]}
          >
            <Radio.Group
              value={role}
              onChange={(event) => setRole(event.target.value as SignupRole)}
              optionType="button"
              buttonStyle="solid"
              size="large"
              className="w-full"
              options={[
                { label: "Client", value: "CLIENT" },
                { label: "Therapist", value: "THERAPIST" },
              ]}
            />
          </Form.Item>
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
