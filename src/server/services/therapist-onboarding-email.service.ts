import { DASHBOARD_ROUTES, EMAIL_TEMPLATES } from "@/lib/constants/auth";
import { logDiagnosticEvent } from "@/server/services/audit-log.service";
import { sendTransactionalEmail } from "@/server/services/email-delivery.service";

type TherapistOnboardingEmailRecipient = {
  userId: string;
  email: string;
  firstName?: string | null;
  displayName?: string | null;
};

type TherapistOnboardingRejectedEmailInput = TherapistOnboardingEmailRecipient & {
  rejectionReason: string;
};

function getAppBaseUrl() {
  return process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

function getTherapistDashboardUrl() {
  return `${getAppBaseUrl()}${DASHBOARD_ROUTES.therapist}`;
}

function getTherapistOnboardingUrl() {
  return `${getAppBaseUrl()}/therapist/onboarding`;
}

function getTherapistGreeting(input: TherapistOnboardingEmailRecipient) {
  const name = input.firstName?.trim() || input.displayName?.trim();

  return name ? `Hi ${name},` : "Hi,";
}

function buildPendingReviewText(input: TherapistOnboardingEmailRecipient) {
  return [
    getTherapistGreeting(input),
    "",
    "Your Theraply therapist profile has been submitted and is now pending review.",
    "",
    "We will email you again once the review is complete.",
    "",
    `You can check your onboarding status here: ${getTherapistOnboardingUrl()}`,
    "",
    "Theraply Support",
  ].join("\n");
}

function buildApprovedText(input: TherapistOnboardingEmailRecipient) {
  return [
    getTherapistGreeting(input),
    "",
    "Good news: your Theraply therapist profile has been approved.",
    "",
    "You can now access your therapist dashboard and continue setting up your availability and sessions.",
    "",
    `Open your therapist dashboard: ${getTherapistDashboardUrl()}`,
    "",
    "Theraply Support",
  ].join("\n");
}

function buildRejectedText(input: TherapistOnboardingRejectedEmailInput) {
  return [
    getTherapistGreeting(input),
    "",
    "Your Theraply therapist profile needs changes before it can be approved.",
    "",
    "Review reason:",
    input.rejectionReason,
    "",
    "Please update your onboarding profile and submit it again for review.",
    "",
    `Update your profile here: ${getTherapistOnboardingUrl()}`,
    "",
    "Theraply Support",
  ].join("\n");
}

async function sendTherapistOnboardingEmailBestEffort(input: {
  recipient: TherapistOnboardingEmailRecipient;
  template: string;
  subject: string;
  text: string;
  actionUrl: string;
}) {
  try {
    await sendTransactionalEmail({
      userId: input.recipient.userId,
      email: input.recipient.email,
      template: input.template,
      subject: input.subject,
      text: input.text,
      actionUrl: input.actionUrl,
    });
  } catch (error) {
    logDiagnosticEvent("therapist-onboarding-email", "Delivery failed.", {
      template: input.template,
      userId: input.recipient.userId,
      email: input.recipient.email,
      error,
    });
  }
}

export async function sendTherapistOnboardingPendingReviewEmail(
  recipient: TherapistOnboardingEmailRecipient,
) {
  await sendTherapistOnboardingEmailBestEffort({
    recipient,
    template: EMAIL_TEMPLATES.therapistOnboardingPendingReview,
    subject: "Your Theraply profile is pending review",
    text: buildPendingReviewText(recipient),
    actionUrl: getTherapistOnboardingUrl(),
  });
}

export async function sendTherapistOnboardingApprovedEmail(
  recipient: TherapistOnboardingEmailRecipient,
) {
  await sendTherapistOnboardingEmailBestEffort({
    recipient,
    template: EMAIL_TEMPLATES.therapistOnboardingApproved,
    subject: "Your Theraply therapist profile has been approved",
    text: buildApprovedText(recipient),
    actionUrl: getTherapistDashboardUrl(),
  });
}

export async function sendTherapistOnboardingRejectedEmail(
  input: TherapistOnboardingRejectedEmailInput,
) {
  await sendTherapistOnboardingEmailBestEffort({
    recipient: input,
    template: EMAIL_TEMPLATES.therapistOnboardingRejected,
    subject: "Your Theraply profile needs changes",
    text: buildRejectedText(input),
    actionUrl: getTherapistOnboardingUrl(),
  });
}
