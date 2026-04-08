import { UserRole } from "@prisma/client";
import { Card, Layout, Space, Typography } from "antd";
import { requireRole } from "@/lib/permissions";

const { Content } = Layout;
const { Paragraph, Title } = Typography;

export default async function ClientDashboardPage() {
  const user = await requireRole([UserRole.CLIENT]);

  return (
    <Layout className="site-shell">
      <Content className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-16 md:px-10">
        <Card className="soft-card w-full max-w-2xl" bordered={false}>
          <Space direction="vertical" size="middle" className="w-full">
            <Title level={2}>Client Dashboard</Title>
            <Paragraph type="secondary">
              Signed in as {user.email}. This is the protected client landing page placeholder.
            </Paragraph>
          </Space>
        </Card>
      </Content>
    </Layout>
  );
}
