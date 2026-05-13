import { BookingStatus, PaymentStatus } from "@prisma/client";
import { EMAIL_TEMPLATES } from "@/lib/constants/auth";
import { formatAppDateTime } from "@/lib/utils/date-time";
import { formatBookingStatus, formatPaymentStatus } from "@/lib/utils/format-booking";

type EmailTemplateOutput = {
  template: string;
  subject: string;
  text: string;
  html: string;
  actionUrl?: string;
};

type MoneyInput = {
  amountMinor: number;
  currency: string;
};

type BookingEmailInput = {
  recipientName?: string | null;
  clientName?: string | null;
  therapistName?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  bookingStatus?: BookingStatus | string | null;
  meetingLink?: string | null;
  dashboardUrl?: string | null;
  sessionUrl?: string | null;
};

type BookingRejectedEmailInput = BookingEmailInput & {
  rejectionReason?: string | null;
};

type BookingCancelledEmailInput = BookingEmailInput & {
  cancellationReason?: string | null;
  cancelledByName?: string | null;
};

type PaymentEmailInput = BookingEmailInput & {
  paymentStatus?: PaymentStatus | string | null;
  amount?: MoneyInput | null;
  failedReason?: string | null;
};

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getGreeting(name?: string | null) {
  const normalizedName = normalizeText(name);
  return normalizedName ? `Hi ${normalizedName},` : "Hi,";
}

function getBookingStatusLabel(status?: BookingStatus | string | null) {
  if (!status) {
    return "Not available";
  }

  return Object.values(BookingStatus).includes(status as BookingStatus)
    ? formatBookingStatus(status as BookingStatus)
    : status;
}

function getPaymentStatusLabel(status?: PaymentStatus | string | null) {
  if (!status) {
    return "Not available";
  }

  return Object.values(PaymentStatus).includes(status as PaymentStatus)
    ? formatPaymentStatus(status as PaymentStatus)
    : status;
}

function formatMoney(input?: MoneyInput | null) {
  if (!input) {
    return null;
  }

  const currency = input.currency.trim().toUpperCase() || "GBP";

  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
    }).format(input.amountMinor / 100);
  } catch {
    return `${input.amountMinor / 100} ${currency}`;
  }
}

function getActionUrl(input: BookingEmailInput) {
  return normalizeText(input.sessionUrl) ?? normalizeText(input.dashboardUrl) ?? undefined;
}

function buildTextEmail(params: {
  greetingName?: string | null;
  intro: string;
  details: Array<[label: string, value?: string | null]>;
  actionUrl?: string;
  footer?: string;
}) {
  const lines = [getGreeting(params.greetingName), "", params.intro, ""];

  for (const [label, value] of params.details) {
    const normalizedValue = normalizeText(value);

    if (normalizedValue) {
      lines.push(`${label}: ${normalizedValue}`);
    }
  }

  if (params.actionUrl) {
    lines.push("", `Open in Theraply: ${params.actionUrl}`);
  }

  lines.push("", params.footer ?? "Theraply Support");

  return lines.join("\n");
}

function buildHtmlEmail(params: {
  title: string;
  greetingName?: string | null;
  intro: string;
  details: Array<[label: string, value?: string | null]>;
  actionUrl?: string;
  actionLabel?: string;
  footer?: string;
}) {
  const rows = params.details
    .map(([label, value]) => {
      const normalizedValue = normalizeText(value);

      if (!normalizedValue) {
        return "";
      }

      return `
        <tr>
          <td style="padding:8px 0;color:#526070;">${escapeHtml(label)}</td>
          <td style="padding:8px 0;text-align:right;color:#0f172a;font-weight:600;">${escapeHtml(normalizedValue)}</td>
        </tr>`;
    })
    .filter(Boolean)
    .join("");

  const action = params.actionUrl
    ? `
      <p style="margin:24px 0 0;">
        <a href="${escapeHtml(params.actionUrl)}" style="display:inline-block;border-radius:999px;background:#2563eb;color:#ffffff;padding:12px 18px;text-decoration:none;font-weight:700;">
          ${escapeHtml(params.actionLabel ?? "Open in Theraply")}
        </a>
      </p>`
    : "";

  return `
    <!doctype html>
    <html>
      <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
          <div style="border-radius:20px;background:#ffffff;padding:28px;border:1px solid #e2e8f0;">
            <p style="margin:0 0 16px;color:#2563eb;font-size:14px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Theraply</p>
            <h1 style="margin:0 0 20px;font-size:26px;line-height:1.25;color:#0f172a;">${escapeHtml(params.title)}</h1>
            <p style="margin:0 0 12px;font-size:16px;line-height:1.6;">${escapeHtml(getGreeting(params.greetingName))}</p>
            <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#334155;">${escapeHtml(params.intro)}</p>
            <table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
              ${rows}
            </table>
            ${action}
            <p style="margin:28px 0 0;color:#64748b;font-size:14px;line-height:1.6;">${escapeHtml(params.footer ?? "Theraply Support")}</p>
          </div>
        </div>
      </body>
    </html>`;
}

function getBookingDetails(input: BookingEmailInput) {
  return [
    ["Client", input.clientName],
    ["Therapist", input.therapistName],
    ["Session starts", input.startsAt ? formatAppDateTime(input.startsAt) : null],
    ["Session ends", input.endsAt ? formatAppDateTime(input.endsAt) : null],
    ["Booking status", getBookingStatusLabel(input.bookingStatus)],
    ["Meeting link", input.meetingLink],
  ] satisfies Array<[string, string | null | undefined]>;
}

export function buildBookingRequestCreatedEmail(
  input: BookingEmailInput,
): EmailTemplateOutput {
  const actionUrl = getActionUrl(input);
  const intro =
    "A new booking request has been created and is waiting for therapist confirmation.";
  const details = getBookingDetails(input);

  return {
    template: EMAIL_TEMPLATES.bookingRequestCreated,
    subject: "Your Theraply booking request was created",
    text: buildTextEmail({
      greetingName: input.recipientName,
      intro,
      details,
      actionUrl,
    }),
    html: buildHtmlEmail({
      title: "Booking request created",
      greetingName: input.recipientName,
      intro,
      details,
      actionUrl,
      actionLabel: "Open booking",
    }),
    actionUrl,
  };
}

export function buildBookingConfirmedEmail(input: BookingEmailInput): EmailTemplateOutput {
  const actionUrl = getActionUrl(input);
  const intro = "Your booking has been confirmed by the therapist.";
  const details = getBookingDetails(input);

  return {
    template: EMAIL_TEMPLATES.bookingConfirmed,
    subject: "Your Theraply booking is confirmed",
    text: buildTextEmail({
      greetingName: input.recipientName,
      intro,
      details,
      actionUrl,
    }),
    html: buildHtmlEmail({
      title: "Booking confirmed",
      greetingName: input.recipientName,
      intro,
      details,
      actionUrl,
      actionLabel: "Open session",
    }),
    actionUrl,
  };
}

export function buildBookingRejectedEmail(
  input: BookingRejectedEmailInput,
): EmailTemplateOutput {
  const actionUrl = getActionUrl(input);
  const intro = "Your booking request was not accepted by the therapist.";
  const details = [
    ...getBookingDetails(input),
    ["Review reason", input.rejectionReason],
  ] satisfies Array<[string, string | null | undefined]>;

  return {
    template: EMAIL_TEMPLATES.bookingRejected,
    subject: "Your Theraply booking request was not accepted",
    text: buildTextEmail({
      greetingName: input.recipientName,
      intro,
      details,
      actionUrl,
    }),
    html: buildHtmlEmail({
      title: "Booking request not accepted",
      greetingName: input.recipientName,
      intro,
      details,
      actionUrl,
      actionLabel: "Open dashboard",
    }),
    actionUrl,
  };
}

export function buildBookingCancelledEmail(
  input: BookingCancelledEmailInput,
): EmailTemplateOutput {
  const actionUrl = getActionUrl(input);
  const intro = "A Theraply booking has been cancelled.";
  const details = [
    ...getBookingDetails(input),
    ["Cancelled by", input.cancelledByName],
    ["Cancellation reason", input.cancellationReason],
  ] satisfies Array<[string, string | null | undefined]>;

  return {
    template: EMAIL_TEMPLATES.bookingCancelled,
    subject: "Your Theraply booking was cancelled",
    text: buildTextEmail({
      greetingName: input.recipientName,
      intro,
      details,
      actionUrl,
    }),
    html: buildHtmlEmail({
      title: "Booking cancelled",
      greetingName: input.recipientName,
      intro,
      details,
      actionUrl,
      actionLabel: "Open booking",
    }),
    actionUrl,
  };
}

export function buildPaymentSuccessfulEmail(input: PaymentEmailInput): EmailTemplateOutput {
  const actionUrl = getActionUrl(input);
  const amount = formatMoney(input.amount);
  const intro = "Your payment for a Theraply session was successful.";
  const details = [
    ...getBookingDetails(input),
    ["Payment status", getPaymentStatusLabel(input.paymentStatus ?? PaymentStatus.PAID)],
    ["Amount", amount],
  ] satisfies Array<[string, string | null | undefined]>;

  return {
    template: EMAIL_TEMPLATES.paymentSuccessful,
    subject: "Your Theraply payment was successful",
    text: buildTextEmail({
      greetingName: input.recipientName,
      intro,
      details,
      actionUrl,
    }),
    html: buildHtmlEmail({
      title: "Payment successful",
      greetingName: input.recipientName,
      intro,
      details,
      actionUrl,
      actionLabel: "Open payment",
    }),
    actionUrl,
  };
}

export function buildPaymentFailedEmail(input: PaymentEmailInput): EmailTemplateOutput {
  const actionUrl = getActionUrl(input);
  const amount = formatMoney(input.amount);
  const intro = "Your payment for a Theraply session was not completed.";
  const details = [
    ...getBookingDetails(input),
    ["Payment status", getPaymentStatusLabel(input.paymentStatus ?? PaymentStatus.FAILED)],
    ["Amount", amount],
    ["Failure reason", input.failedReason],
  ] satisfies Array<[string, string | null | undefined]>;

  return {
    template: EMAIL_TEMPLATES.paymentFailed,
    subject: "Your Theraply payment was not completed",
    text: buildTextEmail({
      greetingName: input.recipientName,
      intro,
      details,
      actionUrl,
    }),
    html: buildHtmlEmail({
      title: "Payment not completed",
      greetingName: input.recipientName,
      intro,
      details,
      actionUrl,
      actionLabel: "Review payment",
    }),
    actionUrl,
  };
}
