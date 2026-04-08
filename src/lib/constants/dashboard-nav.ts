import { UserRole } from "@prisma/client";

export type DashboardNavItem = {
  key: string;
  href: string;
  label: string;
  description: string;
};

export const dashboardAreaMeta: Record<
  UserRole,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  CLIENT: {
    eyebrow: "Client area",
    title: "Client Workspace",
    description: "Your secure Theraply space for bookings, session updates, and payments.",
  },
  THERAPIST: {
    eyebrow: "Therapist area",
    title: "Therapist Workspace",
    description: "A focused workspace for reviewing requests, managing sessions, and preparing availability.",
  },
  ADMIN: {
    eyebrow: "Admin area",
    title: "Operations Console",
    description: "A central place to monitor users, therapists, bookings, and platform activity.",
  },
};

export const dashboardNavByRole: Record<UserRole, DashboardNavItem[]> = {
  CLIENT: [
    {
      key: "client-dashboard",
      href: "/client/dashboard",
      label: "Dashboard",
      description: "Overview, upcoming sessions, and payment summary.",
    },
  ],
  THERAPIST: [
    {
      key: "therapist-dashboard",
      href: "/therapist/dashboard",
      label: "Dashboard",
      description: "Overview, incoming requests, and schedule readiness.",
    },
  ],
  ADMIN: [
    {
      key: "admin-dashboard",
      href: "/admin/dashboard",
      label: "Dashboard",
      description: "Platform health, activity visibility, and management entry point.",
    },
  ],
};
