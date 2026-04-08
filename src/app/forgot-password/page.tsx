"use client";

import { Button, Card, Form, Input, Layout, Space, Typography } from "antd";

const { Content } = Layout;
const { Paragraph, Title } = Typography;

export default function ForgotPasswordPage() {
  return (
    <Layout className="site-shell">
      <Content className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-16 md:px-10">
        <Card className="soft-card w-full max-w-md" bordered={false}>
          <Space direction="vertical" size="large" className="w-full">
            <div>
              <Title level={2}>Forgot Password</Title>
              <Paragraph type="secondary">
                Password recovery screen placeholder for the next phase.
              </Paragraph>
            </div>
            <Form layout="vertical" disabled>
              <Form.Item label="Email address">
                <Input placeholder="name@example.com" />
              </Form.Item>
              <Button type="primary" block>
                Send reset link
              </Button>
            </Form>
          </Space>
        </Card>
      </Content>
    </Layout>
  );
}
