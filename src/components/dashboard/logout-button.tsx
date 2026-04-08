"use client";

import { Button } from "antd";
import { signOut } from "next-auth/react";
import { AUTH_ROUTES } from "@/lib/constants/auth";

export function LogoutButton() {
  return (
    <Button type="default" size="large" onClick={() => signOut({ callbackUrl: AUTH_ROUTES.login })}>
      Sign out
    </Button>
  );
}
