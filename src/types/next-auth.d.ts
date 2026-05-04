import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: string;
      emailVerified?: boolean;
      emailVerifiedAt?: Date | string | null;
      therapistApprovalStatus?: string | null;
      therapistOnboardingCompleted?: boolean | null;
      firstName?: string;
      lastName?: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role?: string;
    emailVerified?: boolean;
    emailVerifiedAt?: Date | string | null;
    therapistApprovalStatus?: string | null;
    therapistOnboardingCompleted?: boolean | null;
    firstName?: string;
    lastName?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    emailVerified?: boolean;
    emailVerifiedAt?: string | null;
    therapistApprovalStatus?: string | null;
    therapistOnboardingCompleted?: boolean | null;
    firstName?: string;
    lastName?: string;
  }
}
