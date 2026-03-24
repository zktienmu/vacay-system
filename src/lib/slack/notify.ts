import "server-only";
import { WebClient } from "@slack/web-api";
import type { LeaveRequest, Employee } from "@/types";
import {
  buildNewRequestBlocks,
  buildApprovedBlocks,
  buildRejectedBlocks,
  buildCancelledBlocks,
  formatShortDates,
  formatDateRange,
  type ResolvedDelegateAssignment,
} from "./format";

// Initialize WebClient only if SLACK_BOT_TOKEN is set (graceful degradation)
const slack: WebClient | null = process.env.SLACK_BOT_TOKEN
  ? new WebClient(process.env.SLACK_BOT_TOKEN)
  : null;

const channelId = process.env.SLACK_LEAVE_CHANNEL_ID;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Notify all admins via DM about a new leave request.
 * Fire-and-forget: errors are logged, never thrown.
 */
export async function notifyNewRequest(
  request: LeaveRequest,
  employee: Employee,
  admins: Employee[],
): Promise<void> {
  if (!slack) {
    console.debug("[Slack] SLACK_BOT_TOKEN not configured, skipping notifyNewRequest");
    return;
  }

  const blocks = buildNewRequestBlocks(request, employee, appUrl);
  const fallbackText = `🆕 ${employee.name} 提出了新的假期申請`;

  // DM all approvers
  const dmPromises = admins
    .filter((admin) => admin.slack_user_id)
    .map(async (admin) => {
      try {
        await slack.chat.postMessage({
          channel: admin.slack_user_id!,
          text: fallbackText,
          blocks,
        });
      } catch (error) {
        console.error("[Slack] Failed to DM admin", admin.id, error);
      }
    });

  await Promise.allSettled(dmPromises);

  // Post to the leave channel
  if (channelId) {
    try {
      await slack.chat.postMessage({
        channel: channelId,
        text: fallbackText,
        blocks,
      });
    } catch (error) {
      console.error("[Slack] Failed to post new request to leave channel", error);
    }
  }
}

/**
 * Notify the employee via DM and post to the leave channel about approval.
 * Fire-and-forget: errors are logged, never thrown.
 */
export async function notifyApproved(
  request: LeaveRequest,
  employee: Employee,
  delegateNames?: string[],
  resolvedAssignments?: ResolvedDelegateAssignment[],
): Promise<void> {
  if (!slack) {
    console.debug("[Slack] SLACK_BOT_TOKEN not configured, skipping notifyApproved");
    return;
  }

  const blocks = buildApprovedBlocks(request, employee, delegateNames, resolvedAssignments);
  const fallbackText = `✅ ${employee.name} 的假期已核准`;

  // DM the employee
  if (employee.slack_user_id) {
    try {
      await slack.chat.postMessage({
        channel: employee.slack_user_id,
        text: fallbackText,
        blocks,
      });
    } catch (error) {
      console.error("[Slack] Failed to DM employee about approval", error);
    }
  }

  // Post to the leave channel
  if (channelId) {
    try {
      await slack.chat.postMessage({
        channel: channelId,
        text: fallbackText,
        blocks,
      });
    } catch (error) {
      console.error("[Slack] Failed to post approval to leave channel", error);
    }
  }
}

/**
 * Notify the delegate via DM that they are covering for the employee.
 * Fire-and-forget: errors are logged, never thrown.
 *
 * When assignment info is provided, the DM shows the delegate's specific
 * dates and handover note. Otherwise falls back to showing the full leave range.
 */
export async function notifyDelegate(
  request: LeaveRequest,
  employee: Employee,
  delegate: Employee,
  assignment?: { dates: string[]; handover_note: string | null },
): Promise<void> {
  if (!slack || !delegate.slack_user_id) return;

  const dateRange = formatDateRange(request.start_date, request.end_date);

  let bodyLines: string[];

  if (assignment && assignment.dates.length > 0) {
    // Per-delegate assignment details
    const shortDates = formatShortDates(assignment.dates);
    bodyLines = [
      `📋 *${employee.name} 休假代理通知*`,
      `📅 日期：${dateRange}（${request.days} 天）`,
      ``,
      `你的代理日期：${shortDates}`,
    ];
    if (assignment.handover_note) {
      bodyLines.push(`交接事項：${assignment.handover_note}`);
    }
    bodyLines.push(``, `如有問題請聯繫 ${employee.name}。`);
  } else {
    // Legacy fallback — no per-delegate assignment
    const handoverText = request.handover_url
      ? `\n📋 交接事項：<${request.handover_url}|查看交接文件>`
      : "";
    bodyLines = [
      `📋 *你是 ${employee.name} 的代理人*`,
      `📅 日期：${dateRange}（${request.days} 天）${handoverText}`,
    ];
  }

  try {
    await slack.chat.postMessage({
      channel: delegate.slack_user_id,
      text: `📋 ${employee.name} 休假代理通知`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: bodyLines.join("\n"),
          },
        },
      ],
    });
  } catch (error) {
    console.error("[Slack] Failed to notify delegate", delegate.id, error);
  }
}

/**
 * Notify the employee via DM about rejection.
 * Fire-and-forget: errors are logged, never thrown.
 */
export async function notifyRejected(
  request: LeaveRequest,
  employee: Employee,
): Promise<void> {
  if (!slack) {
    console.debug("[Slack] SLACK_BOT_TOKEN not configured, skipping notifyRejected");
    return;
  }

  if (!employee.slack_user_id) {
    return;
  }

  const blocks = buildRejectedBlocks(request, employee);

  try {
    await slack.chat.postMessage({
      channel: employee.slack_user_id,
      text: `❌ 你的假期申請已被駁回`,
      blocks,
    });
  } catch (error) {
    console.error("[Slack] Failed to DM employee about rejection", error);
  }
}

/**
 * Post cancellation notice to the leave channel.
 * Fire-and-forget: errors are logged, never thrown.
 */
/**
 * Notify a delegate that they've inherited duties from a chain delegation.
 * e.g., A delegated to B, but B is now on leave, so C (B's delegate) takes over.
 */
export async function notifyChainDelegation(
  delegateSlackId: string,
  absentName: string,
  originalRequesterName: string,
  leaveDateRange: string,
  handoverNote: string | null,
): Promise<void> {
  if (!slack || !delegateSlackId) return;

  const lines = [
    `⚠️ *代理轉移通知*`,
    `${absentName} 在 ${leaveDateRange} 休假，`,
    `原本 ${originalRequesterName} 交接給 ${absentName} 的任務現在由你負責：`,
    handoverNote ? `📋 ${handoverNote}` : "",
    ``,
    `如有問題請聯繫 ${originalRequesterName} 或 ${absentName}。`,
  ].filter(Boolean).join("\n");

  try {
    await slack.chat.postMessage({
      channel: delegateSlackId,
      text: `⚠️ 代理轉移：${originalRequesterName} → ${absentName} → 你`,
      blocks: [{ type: "section", text: { type: "mrkdwn", text: lines } }],
    });
  } catch (error) {
    console.error("[Slack] Failed to send chain delegation notification", error);
  }
}

export async function notifyCancelled(
  request: LeaveRequest,
  employee: Employee,
): Promise<void> {
  if (!slack) {
    console.debug("[Slack] SLACK_BOT_TOKEN not configured, skipping notifyCancelled");
    return;
  }

  const blocks = buildCancelledBlocks(request, employee);
  const fallbackText = `🚫 ${employee.name} 取消了假期`;

  // Post to the leave channel
  if (channelId) {
    try {
      await slack.chat.postMessage({
        channel: channelId,
        text: fallbackText,
        blocks,
      });
    } catch (error) {
      console.error("[Slack] Failed to post cancellation to leave channel", error);
    }
  }
}
