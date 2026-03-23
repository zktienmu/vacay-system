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
      text: { type: "mrkdwn", text: `*${employee.name}* 申請 *${typeLabel}*` },
    },
    {
      type: "section",
      fields,
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "審核申請", emoji: true },
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
  delegateNames?: string[],
): (KnownBlock | Block)[] {
  const typeLabel = formatLeaveType(request.leave_type);
  const dateRange = formatDateRange(request.start_date, request.end_date);

  const details: string[] = [
    `📅 日期：${dateRange}（${request.days} 天）`,
  ];

  if (delegateNames && delegateNames.length > 0) {
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
      text: { type: "mrkdwn", text: `*${employee.name}* — ${typeLabel}` },
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

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "❌ 假期已駁回", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${employee.name}* 的 *${typeLabel}* 申請（${dateRange}）已被駁回。`,
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

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "🚫 假期已取消", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${employee.name}* 取消了 *${typeLabel}*（${dateRange}，${request.days} 天）`,
      },
    },
  ];
}
