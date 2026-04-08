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
    {
      key: "client-bookings",
      href: "/client/bookings",
      label: "Bookings",
      description: "Track upcoming and past client sessions.",
    },
    {
      key: "client-payments",
      href: "/client/payments",
      label: "Payments",
      description: "Review payment status and checkout history.",
    },
  ],
  THERAPIST: [
    {
      key: "therapist-dashboard",
      href: "/therapist/dashboard",
      label: "Dashboard",
      description: "Overview, incoming requests, and schedule readiness.",
    },
    {
      key: "therapist-requests",
      href: "/therapist/requests",
      label: "Requests",
      description: "Review and confirm incoming booking requests.",
    },
    {
      key: "therapist-clients",
      href: "/therapist/clients",
      label: "Clients",
      description: "Browse active and historical client relationships.",
    },
    {
      key: "therapist-payout-details",
      href: "/therapist/payout-details",
      label: "Payout details",
      description: "Manage payout setup and banking information.",
    },
  ],
  ADMIN: [
    {
      key: "admin-dashboard",
      href: "/admin/dashboard",
      label: "Dashboard",
      description: "Platform health, activity visibility, and management entry point.",
    },
    {
      key: "admin-users",
      href: "/admin/users",
      label: "Users",
      description: "Inspect user accounts and client records.",
    },
    {
      key: "admin-therapists",
      href: "/admin/therapists",
      label: "Therapists",
      description: "Review therapists, approvals, and availability readiness.",
    },
    {
      key: "admin-bookings",
      href: "/admin/bookings",
      label: "Bookings",
      description: "Monitor booking activity and manual interventions.",
    },
    {
      key: "admin-payments",
      href: "/admin/payments",
      label: "Payments",
      description: "Track payment state, refunds, and payout visibility.",
    },
  ],
};
