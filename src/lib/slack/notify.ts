import "server-only";
import { WebClient } from "@slack/web-api";
import type { LeaveRequest, Employee } from "@/types";
import {
  buildNewRequestBlocks,
  buildApprovedBlocks,
  buildRejectedBlocks,
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

  const dmPromises = admins
    .filter((admin) => admin.slack_user_id)
    .map(async (admin) => {
      try {
        await slack.chat.postMessage({
          channel: admin.slack_user_id!,
          text: `🆕 New leave request from ${employee.name}`,
          blocks,
        });
      } catch (error) {
        console.error("[Slack] Failed to DM admin", admin.id, error);
      }
    });

  try {
    await Promise.allSettled(dmPromises);
  } catch (error) {
    console.error("[Slack] Unexpected error in notifyNewRequest", error);
  }
}

/**
 * Notify the employee via DM and post to the leave channel about approval.
 * Fire-and-forget: errors are logged, never thrown.
 */
export async function notifyApproved(
  request: LeaveRequest,
  employee: Employee,
): Promise<void> {
  if (!slack) {
    console.debug("[Slack] SLACK_BOT_TOKEN not configured, skipping notifyApproved");
    return;
  }

  const blocks = buildApprovedBlocks(request, employee);
  const fallbackText = `✅ Leave approved for ${employee.name}`;

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

  const blocks = buildRejectedBlocks(request);

  try {
    await slack.chat.postMessage({
      channel: employee.slack_user_id,
      text: "❌ Your leave request has been rejected",
      blocks,
    });
  } catch (error) {
    console.error("[Slack] Failed to DM employee about rejection", error);
  }
}
