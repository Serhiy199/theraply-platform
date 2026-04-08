"use client";

import { ConfigProvider, App as AntdApp, theme } from "antd";
import type { ReactNode } from "react";

const theraplyTheme = {
  token: {
    colorPrimary: "#1d4ed8",
    colorInfo: "#1d4ed8",
    colorSuccess: "#15803d",
    colorWarning: "#c2410c",
    colorError: "#b91c1c",
    colorBgBase: "#f8f4ed",
    colorTextBase: "#1f2937",
    borderRadius: 16,
    fontFamily: "var(--font-inter), sans-serif",
  },
  algorithm: theme.defaultAlgorithm,
};

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider theme={theraplyTheme}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
