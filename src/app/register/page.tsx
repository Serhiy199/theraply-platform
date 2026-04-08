"use client";

import Link from "next/link";
import { Card, Layout, Space, Typography } from "antd";
import { RegisterForm } from "@/components/forms/register-form";
import { AUTH_ROUTES } from "@/lib/constants/auth";

const { Content } = Layout;
const { Paragraph, Title } = Typography;

export default function RegisterPage() {
  return (
    <Layout className="site-shell">
      <Content className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-16 md:px-10">
        <Card className="soft-card w-full max-w-xl" bordered={false}>
          <Space direction="vertical" size="large" className="w-full">
            <div>
              <Title level={2}>Registration</Title>
              <Paragraph type="secondary">
                Create your Theraply client account and continue to the booking flow.
              </Paragraph>
            </div>
            <RegisterForm />
            <Paragraph type="secondary" className="!mb-0 text-center">
              Already have an account? <Link href={AUTH_ROUTES.login}>Sign in</Link>
            </Paragraph>
          </Space>
        </Card>
      </Content>
    </Layout>
  );
}
