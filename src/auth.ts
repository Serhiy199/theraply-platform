import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";
import { authenticateWithCredentials } from "@/server/services/auth.service";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  secret: process.env.AUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);

        if (!parsed.success) {
          throw new Error(AUTH_MESSAGES.loginInvalid);
        }

        const user = await authenticateWithCredentials(parsed.data);

        if (!user) {
          throw new Error(AUTH_MESSAGES.loginInvalid);
        }

        return user;
      },
    }),
  ],
  callbacks: {
    async signIn() {
      return true;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }

      try {
        const targetUrl = new URL(url);
        if (targetUrl.origin === baseUrl) {
          return url;
        }
      } catch {
        return baseUrl;
      }

      return baseUrl;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email ?? undefined;
        token.role = (user as { role?: string }).role;
        token.emailVerified = (user as { emailVerified?: boolean }).emailVerified;
        const emailVerifiedAt = (user as { emailVerifiedAt?: Date | string | null }).emailVerifiedAt;
        token.emailVerifiedAt =
          emailVerifiedAt instanceof Date ? emailVerifiedAt.toISOString() : emailVerifiedAt ?? null;
        token.therapistApprovalStatus =
          (user as { therapistApprovalStatus?: string | null }).therapistApprovalStatus ?? null;
        token.therapistOnboardingCompleted =
          (user as { therapistOnboardingCompleted?: boolean | null }).therapistOnboardingCompleted ??
          null;
        token.firstName = (user as { firstName?: string }).firstName;
        token.lastName = (user as { lastName?: string }).lastName;
      }

      if (!user && token.sub) {
        const freshUser = await prisma.user.findUnique({
          where: {
            id: token.sub,
          },
          select: {
            email: true,
            role: true,
            emailVerified: true,
            emailVerifiedAt: true,
            firstName: true,
            lastName: true,
            therapistProfile: {
              select: {
                approvalStatus: true,
                onboardingCompleted: true,
              },
            },
          },
        });

        if (freshUser) {
          token.email = freshUser.email;
          token.role = freshUser.role;
          token.emailVerified = freshUser.emailVerified;
          token.emailVerifiedAt = freshUser.emailVerifiedAt?.toISOString() ?? null;
          token.therapistApprovalStatus =
            freshUser.therapistProfile?.approvalStatus ?? null;
          token.therapistOnboardingCompleted =
            freshUser.therapistProfile?.onboardingCompleted ?? null;
          token.firstName = freshUser.firstName ?? undefined;
          token.lastName = freshUser.lastName ?? undefined;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.email = token.email ?? session.user.email ?? null;
        session.user.role = typeof token.role === "string" ? token.role : undefined;
        session.user.emailVerified =
          typeof token.emailVerified === "boolean" ? token.emailVerified : undefined;
        session.user.emailVerifiedAt =
          typeof token.emailVerifiedAt === "string" ? token.emailVerifiedAt : null;
        session.user.therapistApprovalStatus =
          typeof token.therapistApprovalStatus === "string"
            ? token.therapistApprovalStatus
            : null;
        session.user.therapistOnboardingCompleted =
          typeof token.therapistOnboardingCompleted === "boolean"
            ? token.therapistOnboardingCompleted
            : null;
        session.user.firstName =
          typeof token.firstName === "string" ? token.firstName : undefined;
        session.user.lastName =
          typeof token.lastName === "string" ? token.lastName : undefined;
      }

      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
