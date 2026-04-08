"use client";

import { Button, Card, Form, Input, Layout, Space, Typography } from "antd";

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
                Starter form shell for the Theraply onboarding journey.
              </Paragraph>
            </div>
            <Form layout="vertical" disabled>
              <Form.Item label="First name">
                <Input placeholder="First name" />
              </Form.Item>
              <Form.Item label="Last name">
                <Input placeholder="Last name" />
              </Form.Item>
              <Form.Item label="Email address">
                <Input placeholder="name@example.com" />
              </Form.Item>
              <Form.Item label="Password">
                <Input.Password placeholder="Create a password" />
              </Form.Item>
              <Button type="primary" block>
                Create account
              </Button>
            </Form>
          </Space>
        </Card>
      </Content>
    </Layout>
  );
}
