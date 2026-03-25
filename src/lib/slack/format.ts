import "server-only";
import { format, parseISO } from "date-fns";
import type { LeaveType, LeaveRequest, Employee } from "@/types";
import type { KnownBlock, Block } from "@slack/web-api";

const leaveTypeLabels: Record<LeaveType, string> = {
  annual: "特休",
  personal: "事假",
  sick: "病假",
  official: "公假",
  unpaid: "無薪假",
  remote: "遠端工作",
};

/**
 * Escape Slack mrkdwn special characters in user-supplied content.
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

export function formatLeaveType(type: LeaveType): string {
  return leaveTypeLabels[type] ?? type;
}

export function formatDate(isoDate: string): string {
  return format(parseISO(isoDate), "yyyy/MM/dd");
}

export function formatDateRange(startDate: string, endDate: string): string {
  return startDate === endDate
    ? formatDate(startDate)
    : `${formatDate(startDate)} ~ ${formatDate(endDate)}`;
}

/**
 * Format an array of ISO date strings into short "M/d" format, comma-separated.
 * e.g., ["2026-03-03", "2026-03-04"] => "3/3, 3/4"
 */
export function formatShortDates(dates: string[]): string {
  return dates.map((d) => format(parseISO(d), "M/d")).join(", ");
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
  const reviewUrl = `${appUrl}/admin/review/${request.id}`;

  const serialLabel = request.serial_number ? ` (${request.serial_number})` : "";

  const fields: { type: "mrkdwn"; text: string }[] = [
    { type: "mrkdwn", text: `📅 *日期：*${dateRange}（${request.days} 天）` },
  ];

  if (request.notes) {
    fields.push({ type: "mrkdwn", text: `📝 *備註：*${escapeSlackMrkdwn(request.notes)}` });
  }

  if (request.handover_url) {
    fields.push({ type: "mrkdwn", text: `📋 *交接事項：*<${request.handover_url}|查看交接文件>` });
  }

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "🆕 新假期申請", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${employee.name}* 申請 *${typeLabel}*${serialLabel}` },
    },
    {
      type: "section",
      fields,
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `👉 <${reviewUrl}|點此審核申請>`,
        },
      ],
    },
  ];
}

/**
 * Resolved delegate assignment with employee name for display purposes.
 */
export interface ResolvedDelegateAssignment {
  name: string;
  dates: string[];
  handover_note: string | null;
}

/**
 * Build Block Kit blocks for an approved leave notification.
 */
export function buildApprovedBlocks(
  request: LeaveRequest,
  employee: Employee,
  delegateNames?: string[],
  resolvedAssignments?: ResolvedDelegateAssignment[],
): (KnownBlock | Block)[] {
  const typeLabel = formatLeaveType(request.leave_type);
  const dateRange = formatDateRange(request.start_date, request.end_date);
  const serialLabel = request.serial_number ? ` (${request.serial_number})` : "";

  const details: string[] = [
    `📅 日期：${dateRange}（${request.days} 天）`,
  ];

  // Use per-delegate assignment details if available; fall back to simple name list
  if (resolvedAssignments && resolvedAssignments.length > 0) {
    const lines = resolvedAssignments.map((a) => {
      const shortDates = formatShortDates(a.dates);
      const note = a.handover_note ? `：${escapeSlackMrkdwn(a.handover_note)}` : "";
      return `• ${a.name} (${shortDates})${note}`;
    });
    details.push(`\n代理安排：\n${lines.join("\n")}`);
  } else if (delegateNames && delegateNames.length > 0) {
    details.push(`👤 代理人：${delegateNames.join("、")}`);
  }

  if (request.handover_url) {
    details.push(`📋 交接事項：<${request.handover_url}|查看交接文件>`);
  }

  if (request.notes) {
    details.push(`📝 備註：${escapeSlackMrkdwn(request.notes)}`);
  }

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "✅ 假期已核准", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${employee.name}* — ${typeLabel}${serialLabel}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: details.join("\n") },
    },
  ];
}

/**
 * Build Block Kit blocks for a rejected leave notification.
 */
export function buildRejectedBlocks(
  request: LeaveRequest,
  employee: Employee,
): (KnownBlock | Block)[] {
  const typeLabel = formatLeaveType(request.leave_type);
  const dateRange = formatDateRange(request.start_date, request.end_date);
  const serialLabel = request.serial_number ? ` (${request.serial_number})` : "";

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "❌ 假期已駁回", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${employee.name}* 的 *${typeLabel}* 申請（${dateRange}）${serialLabel}已被駁回。`,
      },
    },
  ];
}

/**
 * Build Block Kit blocks for a cancelled leave notification.
 */
export function buildCancelledBlocks(
  request: LeaveRequest,
  employee: Employee,
): (KnownBlock | Block)[] {
  const typeLabel = formatLeaveType(request.leave_type);
  const dateRange = formatDateRange(request.start_date, request.end_date);
  const serialLabel = request.serial_number ? ` (${request.serial_number})` : "";

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "🚫 假期已取消", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${employee.name}* 取消了 *${typeLabel}*（${dateRange}，${request.days} 天）${serialLabel}`,
      },
    },
  ];
}
