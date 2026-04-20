"use client";

import Link from "next/link";
import { DashboardStatusAlert } from "@/components/dashboard/shared/dashboard-status-alert";

type GoogleCalendarConnectionStatusProps = {
  connected: boolean;
  calendarEmail?: string | null;
  calendarId?: string | null;
};

type GoogleCalendarMeetingStatusProps = {
  meetingUrl?: string | null;
  googleCalendarEventId?: string | null;
  googleCalendarEventHtmlLink?: string | null;
  bookingStatus?: string;
};

export function GoogleCalendarConnectionStatus({
  connected,
  calendarEmail,
  calendarId,
}: GoogleCalendarConnectionStatusProps) {
  if (connected) {
    return (
      <DashboardStatusAlert tone="success" title="Google Calendar connected">
        <p>
          Availability and confirmed sessions are syncing with{" "}
          <span className="font-semibold">{calendarEmail ?? "the selected Google Calendar"}</span>.
        </p>
        {calendarId ? <p className="mt-1 text-xs opacity-80">Target calendar: {calendarId}</p> : null}
      </DashboardStatusAlert>
    );
  }

  return (
    <DashboardStatusAlert tone="warning" title="Google Calendar setup is incomplete">
      <p>Bookings can stay pending, but real availability and automatic Meet sync will not run until the therapist connects a calendar.</p>
      <p className="mt-2">
        <Link href="/therapist/payout-details" className="font-semibold underline underline-offset-4">
          Open calendar settings
        </Link>
      </p>
    </DashboardStatusAlert>
  );
}

export function GoogleCalendarMeetingStatus({
  meetingUrl,
  googleCalendarEventId,
  googleCalendarEventHtmlLink,
  bookingStatus,
}: GoogleCalendarMeetingStatusProps) {
  if (meetingUrl && googleCalendarEventId) {
    return (
      <DashboardStatusAlert tone="success" title="Google Meet synced">
        <p>The session link was created from Google Calendar and is already attached to this booking.</p>
        {googleCalendarEventHtmlLink ? (
          <p className="mt-2">
            <a
              href={googleCalendarEventHtmlLink}
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline underline-offset-4"
            >
              Open Google Calendar event
            </a>
          </p>
        ) : null}
      </DashboardStatusAlert>
    );
  }

  if (meetingUrl) {
    return (
      <DashboardStatusAlert tone="info" title="Meeting link ready">
        <p>This session already has a meeting link, but it is not currently marked as Google Calendar generated.</p>
      </DashboardStatusAlert>
    );
  }

  if (bookingStatus === "CONFIRMED") {
    return (
      <DashboardStatusAlert tone="info" title="Calendar sync is in progress">
        <p>This booking is confirmed. The Google Calendar event and Meet link should appear here as soon as syncing completes.</p>
      </DashboardStatusAlert>
    );
  }

  return (
    <DashboardStatusAlert tone="info" title="Waiting for confirmation">
      <p>The Google Calendar event and Meet link will appear automatically after the therapist confirms the booking.</p>
    </DashboardStatusAlert>
  );
}
