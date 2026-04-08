"use client";

import { Button, Card, Col, Layout, Row, Space, Tag, Typography } from "antd";

const { Content } = Layout;
const { Paragraph, Text, Title } = Typography;

export default function Home() {
  return (
    <Layout className="site-shell">
      <Content className="mx-auto flex min-h-screen w-full max-w-7xl items-center px-6 py-16 md:px-10">
        <Row gutter={[24, 24]} className="w-full">
          <Col xs={24} lg={14}>
            <Space direction="vertical" size="large" className="w-full">
              <Tag color="gold" className="w-fit px-3 py-1 text-sm">
                Phase 1 Initialized
              </Tag>
              <Title className="!mb-0 !text-4xl !leading-tight md:!text-6xl">
                Theraply platform foundation is ready for build-out.
              </Title>
              <Paragraph className="max-w-2xl !text-lg">
                This workspace now uses Next.js, Ant Design, Tailwind CSS, and
                Prisma so we can build the client, therapist, and admin
                experiences in one codebase.
              </Paragraph>
              <Space wrap size="middle">
                <Button type="primary" size="large" href="/login">
                  Go to Login
                </Button>
                <Button size="large" href="/register">
                  Open Registration
                </Button>
              </Space>
            </Space>
          </Col>
          <Col xs={24} lg={10}>
            <Space direction="vertical" size="middle" className="w-full">
              <Card title="Project stack" className="soft-card">
                <Space direction="vertical" size="small">
                  <Text>Next.js App Router with TypeScript</Text>
                  <Text>Ant Design for UI components and layouts</Text>
                  <Text>Prisma prepared for PostgreSQL</Text>
                  <Text>Feature-ready structure for client, therapist, admin</Text>
                </Space>
              </Card>
              <Card title="Next implementation steps" className="soft-card">
                <Space direction="vertical" size="small">
                  <Text>Design the Prisma schema for roles and bookings</Text>
                  <Text>Wire up authentication and route protection</Text>
                  <Text>Build the dashboard shells and booking flow</Text>
                </Space>
              </Card>
            </Space>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}
