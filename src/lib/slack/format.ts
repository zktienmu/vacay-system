import "server-only";
import { format, parseISO } from "date-fns";
import type { LeaveType, LeaveRequest, Employee } from "@/types";
import type { KnownBlock, Block } from "@slack/web-api";

const leaveTypeLabels: Record<LeaveType, string> = {
  annual: "Annual Leave",
  personal: "Personal Leave",
  sick: "Sick Leave",
  official: "Official Leave",
  unpaid: "Unpaid Leave",
  remote: "Remote Work",
};

/**
 * Escape Slack mrkdwn special characters in user-supplied content.
 * Prevents injection of formatting, links, or mentions via notes/text fields.
 */
export function escapeSlackMrkdwn(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`");
}

/**
 * Format a leave type into a human-readable label.
 */
export function formatLeaveType(type: LeaveType): string {
  return leaveTypeLabels[type] ?? type;
}

/**
 * Format an ISO date string into a readable date (e.g., "Mar 13, 2026").
 */
export function formatDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMM d, yyyy");
}

/**
 * Format a date range string like "Mar 13, 2026 → Mar 15, 2026".
 */
export function formatDateRange(startDate: string, endDate: string): string {
  return `${formatDate(startDate)} → ${formatDate(endDate)}`;
}

/**
 * Build Block Kit blocks for a new leave request notification.
 */
export function buildNewRequestBlocks(
  request: LeaveRequest,
  employee: Employee,
  appUrl: string,
): (KnownBlock | Block)[] {
  const typeLabel = formatLeaveType(request.leave_type);
  const dateRange = formatDateRange(request.start_date, request.end_date);
  const notes = request.notes ? escapeSlackMrkdwn(request.notes) : "No notes";
  const reviewUrl = `${appUrl}/admin/review/${request.id}`;

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🆕 New Leave Request",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${employee.name}* requests *${typeLabel}*`,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `📅 ${dateRange} (*${request.days}* day${request.days !== 1 ? "s" : ""})`,
        },
        {
          type: "mrkdwn",
          text: `📝 ${notes}`,
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Review Request",
            emoji: true,
          },
          url: reviewUrl,
          style: "primary",
          action_id: "review_request",
        },
      ],
    },
  ];
}

/**
 * Build Block Kit blocks for an approved leave notification.
 */
export function buildApprovedBlocks(
  request: LeaveRequest,
  employee: Employee,
): (KnownBlock | Block)[] {
  const typeLabel = formatLeaveType(request.leave_type);
  const dateRange = formatDateRange(request.start_date, request.end_date);

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "✅ Leave Approved",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${employee.name}* - ${typeLabel}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `📅 ${dateRange} (*${request.days}* day${request.days !== 1 ? "s" : ""})`,
      },
    },
  ];
}

/**
 * Build Block Kit blocks for a rejected leave notification.
 */
export function buildRejectedBlocks(
  request: LeaveRequest,
): (KnownBlock | Block)[] {
  const typeLabel = formatLeaveType(request.leave_type);
  const dateRange = formatDateRange(request.start_date, request.end_date);

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "❌ Leave Rejected",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Your *${typeLabel}* request (${dateRange}) has been rejected.`,
      },
    },
  ];
}
