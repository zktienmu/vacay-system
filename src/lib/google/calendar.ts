import "server-only";
import { calendar_v3, calendar } from "@googleapis/calendar";
import { JWT } from "google-auth-library";
import { addDays, parseISO } from "date-fns";
import type { LeaveRequest, LeaveType } from "@/types";
import { formatLeaveType } from "@/lib/slack/format";

const leaveTypeEmojis: Record<LeaveType, string> = {
  annual: "🌴",
  personal: "👤",
  sick: "🏥",
  official: "💼",
  unpaid: "📋",
  remote: "🏠",
};

// Initialize Google Calendar API only if all required env vars are set
const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const privateKey = process.env.GOOGLE_PRIVATE_KEY;
const calendarId = process.env.GOOGLE_CALENDAR_ID;

const isConfigured = !!(serviceAccountEmail && privateKey && calendarId);

function getCalendarClient(): calendar_v3.Calendar | null {
  if (!isConfigured) {
    return null;
  }

  const auth = new JWT({
    email: serviceAccountEmail,
    // Private keys from env vars typically have escaped newlines
    key: privateKey!.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  return calendar({ version: "v3", auth });
}

/**
 * Create an all-day leave event on the shared Google Calendar.
 * Returns the created event ID, or null on failure.
 * Fire-and-forget: errors are logged, never thrown.
 */
export async function createLeaveEvent(
  request: LeaveRequest,
  employeeName: string,
): Promise<string | null> {
  if (!isConfigured) {
    console.debug(
      "[Google Calendar] Not configured, skipping createLeaveEvent",
    );
    return null;
  }

  const calendarClient = getCalendarClient();
  if (!calendarClient) {
    return null;
  }

  const days = request.days;
  const summary = request.leave_type === "remote"
    ? `${employeeName} Remote${request.notes ? ` — ${request.notes}` : ""}`
    : `${employeeName} ${days > 1 ? `${days} Days` : "Day"}-Off`;

  // Google Calendar all-day events: end date is exclusive,
  // so we add 1 day to include the last day of leave.
  const endDateExclusive = addDays(parseISO(request.end_date), 1)
    .toISOString()
    .split("T")[0];

  try {
    const response = await calendarClient.events.insert({
      calendarId: calendarId!,
      requestBody: {
        summary,
        description: request.notes || undefined,
        start: {
          date: request.start_date,
        },
        end: {
          date: endDateExclusive,
        },
        transparency: "transparent",
      },
    });

    const eventId = response.data.id ?? null;
    return eventId;
  } catch (error) {
    console.error("[Google Calendar] Failed to create leave event", error);
    return null;
  }
}

/**
 * Delete a leave event from the shared Google Calendar.
 * Fire-and-forget: errors are logged, never thrown.
 */
export async function deleteLeaveEvent(eventId: string): Promise<void> {
  if (!isConfigured) {
    console.debug(
      "[Google Calendar] Not configured, skipping deleteLeaveEvent",
    );
    return;
  }

  const calendarClient = getCalendarClient();
  if (!calendarClient) {
    return;
  }

  try {
    await calendarClient.events.delete({
      calendarId: calendarId!,
      eventId,
    });
  } catch (error) {
    console.error("[Google Calendar] Failed to delete leave event", error);
  }
}

/**
 * Get the emoji for a leave type.
 */
export function getLeaveTypeEmoji(type: LeaveType): string {
  return leaveTypeEmojis[type] ?? "";
}
