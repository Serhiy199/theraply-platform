import type { ReactNode } from "react";
import { DashboardStatusAlert } from "@/components/dashboard/shared/dashboard-status-alert";

type BookingStatusTone = "info" | "success" | "warning" | "error";

type BookingStatusAlertProps = {
  tone?: BookingStatusTone;
  title?: string;
  children: ReactNode;
};

export function BookingStatusAlert({ tone = "info", title, children }: BookingStatusAlertProps) {
  return (
    <DashboardStatusAlert tone={tone} title={title}>
      {children}
    </DashboardStatusAlert>
  );
}