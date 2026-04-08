import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { AUTH_MESSAGES } from "@/lib/constants/auth";
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
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email ?? undefined;
        token.role = (user as { role?: string }).role;
        token.firstName = (user as { firstName?: string }).firstName;
        token.lastName = (user as { lastName?: string }).lastName;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.email = token.email ?? session.user.email ?? null;
        session.user.role = typeof token.role === "string" ? token.role : undefined;
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
