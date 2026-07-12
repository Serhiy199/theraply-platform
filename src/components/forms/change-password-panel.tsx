"use client";

import { Card, Layout, Space, Typography } from "antd";
import { ChangePasswordForm } from "@/components/forms/change-password-form";

const { Content } = Layout;
const { Paragraph, Title } = Typography;

type ChangePasswordPanelProps = {
  role?: string | null;
};

export function ChangePasswordPanel({ role }: ChangePasswordPanelProps) {
  return (
    <Layout className="site-shell">
      <Content className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-16 md:px-10">
        <Card className="soft-card w-full max-w-md" bordered={false}>
          <Space direction="vertical" size="large" className="w-full">
            <div>
              <Title level={2}>Change Password</Title>
              <Paragraph type="secondary">
                Update the password for your Theraply account.
              </Paragraph>
            </div>
            <ChangePasswordForm role={role} />
          </Space>
        </Card>
      </Content>
    </Layout>
  );
}
