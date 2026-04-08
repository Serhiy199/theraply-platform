"use client";

import Link from "next/link";
import { Card, Space } from "antd";
import { RegisterForm } from "@/components/forms/register-form";
import { AUTH_ROUTES } from "@/lib/constants/auth";

export default function RegisterPage() {
  return (
    <main className="site-shell mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-16 md:px-10">
      <Card className="soft-card w-full max-w-xl" bordered={false}>
        <Space direction="vertical" size="large" className="w-full">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Registration</h1>
            <p className="mt-3 text-base text-slate-600">
              Create your Theraply client account and continue to the booking flow.
            </p>
          </div>
          <RegisterForm />
          <p className="text-center text-sm text-slate-600">
            Already have an account? <Link href={AUTH_ROUTES.login}>Sign in</Link>
          </p>
        </Space>
      </Card>
    </main>
  );
}
