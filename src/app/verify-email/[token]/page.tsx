import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getPostLoginRedirectForUser,
  resolveClientBookingCallbackUrl,
} from "@/lib/auth/redirects";
import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_MESSAGES, AUTH_ROUTES } from "@/lib/constants/auth";
import {
  EmailVerificationServiceError,
  verifyEmailToken,
  type EmailVerificationResult,
} from "@/server/services/email-verification.service";

export const dynamic = "force-dynamic";

type VerifyEmailPageProps = {
  params: Promise<{
    token: string;
  }>;
  searchParams: Promise<{
    callbackUrl?: string | string[];
  }>;
};

type VerifyEmailState = {
  tone: "success" | "info" | "error";
  title: string;
  description: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
  showResend?: boolean;
};

function getRedirectForVerificationResult(
  result: EmailVerificationResult,
  callbackUrl: unknown,
) {
  return getPostLoginRedirectForUser(
    {
      role: result.role,
      emailVerified: true,
      therapistApprovalStatus: result.therapistApprovalStatus,
    },
    resolveClientBookingCallbackUrl(callbackUrl),
  );
}

function getErrorState(error: EmailVerificationServiceError): VerifyEmailState {
  if (error.code === "TOKEN_EXPIRED" || error.code === "TOKEN_USED") {
    return {
      tone: "error",
      title: "Verification link unavailable",
      description: "This verification link is invalid or has expired.",
      message: "Request a new verification email and use the latest link we send you.",
      showResend: true,
    };
  }

  return {
    tone: "error",
    title: "Verification link unavailable",
    description: "This verification link is invalid or has expired.",
    message: error.code === "TOKEN_NOT_FOUND"
      ? AUTH_MESSAGES.emailVerificationInvalidToken
      : AUTH_MESSAGES.emailVerificationGenericError,
    showResend: true,
  };
}

function VerifyEmailStateCard({ state }: { state: VerifyEmailState }) {
  const alertToneClass =
    state.tone === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : state.tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-blue-200 bg-blue-50 text-blue-900";

  return (
    <main className="site-shell flex min-h-screen w-full items-center justify-center px-6 py-16 md:px-10">
      <section className="soft-card w-full max-w-md rounded-[24px] p-8">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">{state.title}</h1>
          <p className="mt-3 text-base leading-7 text-slate-600">{state.description}</p>
        </div>
        <div className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${alertToneClass}`}>
          {state.message}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {state.actionHref && state.actionLabel ? (
            <Link
              href={state.actionHref}
              className="inline-flex rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white"
            >
              {state.actionLabel}
            </Link>
          ) : null}
          {state.showResend ? (
            <Link
              href={AUTH_ROUTES.login}
              className="inline-flex rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white"
            >
              Sign in to request a new email
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default async function VerifyEmailPage({
  params,
  searchParams,
}: VerifyEmailPageProps) {
  const { token } = await params;
  const resolvedSearchParams = await searchParams;
  const currentUser = await getCurrentUser();
  let redirectTo: string | null = null;

  try {
    const result = await verifyEmailToken(token);
    redirectTo = getRedirectForVerificationResult(
      result,
      resolvedSearchParams.callbackUrl,
    );

    console.info("[verify-email] token handled", {
      status: result.status,
      tokenUserId: result.userId,
      currentSessionUserId: currentUser?.id ?? null,
      tokenUserEmailVerified: true,
      therapistApprovalStatus: result.therapistApprovalStatus ?? null,
      sessionEmailVerified: currentUser?.emailVerified ?? null,
      redirectTo,
    });

    if (result.status === "already_verified") {
      return (
        <VerifyEmailStateCard
          state={{
            tone: "info",
            title: "Email already verified",
            description: "Your Theraply email address is already confirmed.",
            message: "You can continue to your workspace.",
            actionHref: redirectTo,
            actionLabel: "Continue",
          }}
        />
      );
    }
  } catch (error) {
    if (error instanceof EmailVerificationServiceError) {
      return <VerifyEmailStateCard state={getErrorState(error)} />;
    }

    return (
      <VerifyEmailStateCard
        state={{
          tone: "error",
          title: "Email verification",
          description: "We could not verify your email address with this link.",
          message: AUTH_MESSAGES.emailVerificationGenericError,
          showResend: true,
        }}
      />
    );
  }

  redirect(redirectTo);
}
