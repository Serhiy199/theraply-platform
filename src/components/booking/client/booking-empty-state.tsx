import type { ReactNode } from "react";
import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";

type BookingEmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function BookingEmptyState({ title, description, action }: BookingEmptyStateProps) {
  return (
    <DashboardEmptyState
      meta="Booking flow"
      title={title}
      description={description}
      action={action}
    />
  );
}