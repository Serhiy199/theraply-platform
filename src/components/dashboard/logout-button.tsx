"use client";

import { useTransition } from "react";
import { Button } from "antd";
import { signOut } from "next-auth/react";
import { AUTH_ROUTES } from "@/lib/constants/auth";

type LogoutButtonProps = {
  block?: boolean;
  size?: "small" | "middle" | "large";
  variant?: "solid" | "outlined" | "text";
};

export function LogoutButton({ block = false, size = "large", variant = "outlined" }: LogoutButtonProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      block={block}
      type={variant === "solid" ? "primary" : "default"}
      ghost={variant === "text"}
      size={size}
      loading={isPending}
      onClick={() =>
        startTransition(() => {
          void signOut({ callbackUrl: AUTH_ROUTES.login });
        })
      }
    >
      {isPending ? "Signing out..." : "Sign out"}
    </Button>
  );
}
