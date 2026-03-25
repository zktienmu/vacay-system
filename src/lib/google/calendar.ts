import "server-only";
import { calendar_v3, calendar } from "@googleapis/calendar";
import { JWT } from "google-auth-library";
import { addDays, parseISO, isWeekend, format } from "date-fns";
import type { LeaveRequest, LeaveType } from "@/types";
import { formatLeaveType } from "@/lib/slack/format";

const leaveTypeEmojis: Record<LeaveType, string> = {
  annual: "🌴",
  personal: "👤",
  sick: "🏥",
  unpaid: "📋",
  remote: "🏠",
  family_care: "👨‍👩‍👧",
  menstrual: "🩸",
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

  // Split the leave range into weekday-only segments (skip weekends).
  // e.g., Thu-Tue becomes [Thu-Fri, Mon-Tue] as two separate events.
  const segments: { start: string; end: string }[] = [];
  let segStart: Date | null = null;
  let current = parseISO(request.start_date);
  const endDate = parseISO(request.end_date);

  while (current <= endDate) {
    if (!isWeekend(current)) {
      if (!segStart) segStart = current;
    } else if (segStart) {
      // Weekend hit — close the current segment
      segments.push({
        start: format(segStart, "yyyy-MM-dd"),
        end: format(addDays(current, 0), "yyyy-MM-dd"), // exclusive: the weekend day itself
      });
      segStart = null;
    }
    current = addDays(current, 1);
  }
  // Close final segment
  if (segStart) {
    segments.push({
      start: format(segStart, "yyyy-MM-dd"),
      end: format(addDays(endDate, 1), "yyyy-MM-dd"), // exclusive
    });
  }

  try {
    // Create one event per weekday segment
    const eventIds: string[] = [];
    for (const seg of segments) {
      const response = await calendarClient.events.insert({
        calendarId: calendarId!,
        requestBody: {
          summary,
          description: request.notes || undefined,
          start: { date: seg.start },
          end: { date: seg.end },
          transparency: "transparent",
        },
      });
      if (response.data.id) eventIds.push(response.data.id);
    }

    // Return all event IDs joined by comma for cleanup
    return eventIds.length > 0 ? eventIds.join(",") : null;
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

  // eventId may be comma-separated (multiple segments for cross-weekend leave)
  const ids = eventId.split(",").map((id) => id.trim()).filter(Boolean);
  for (const id of ids) {
    try {
      await calendarClient.events.delete({
        calendarId: calendarId!,
        eventId: id,
      });
    } catch (error) {
      console.error("[Google Calendar] Failed to delete leave event", id, error);
    }
  }
}

/**
 * Get the emoji for a leave type.
 */
export function getLeaveTypeEmoji(type: LeaveType): string {
  return leaveTypeEmojis[type] ?? "";
}
