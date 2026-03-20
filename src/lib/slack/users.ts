import "server-only";
import { WebClient } from "@slack/web-api";
import { supabase } from "@/lib/supabase/client";

export interface SlackUser {
  /** Employee ID (UUID) if this Slack user has a matching employee record */
  employee_id: string | null;
  slack_user_id: string;
  name: string;
  display_name: string;
  avatar_url: string | null;
}

const slack: WebClient | null = process.env.SLACK_BOT_TOKEN
  ? new WebClient(process.env.SLACK_BOT_TOKEN)
  : null;

/**
 * Fetch all active Slack workspace members and cross-reference with
 * the employees table. Returns only real users (no bots, no deleted).
 * Excludes the requesting user from the list.
 */
export async function getSlackUsers(
  currentEmployeeId: string,
): Promise<SlackUser[]> {
  if (!slack) {
    console.debug("[Slack] SLACK_BOT_TOKEN not configured, returning empty list");
    return [];
  }

  // Fetch Slack workspace members
  const result = await slack.users.list({});
  const members = result.members ?? [];

  // Filter to real, active human users
  const activeMembers = members.filter(
    (m) =>
      !m.deleted &&
      !m.is_bot &&
      m.id !== "USLACKBOT" &&
      !m.is_restricted &&
      !m.is_ultra_restricted,
  );

  // Fetch all employees to cross-reference by slack_user_id
  const { data: employees } = await supabase
    .from("employees")
    .select("id, slack_user_id");

  const slackIdToEmployeeId = new Map<string, string>();
  for (const emp of employees ?? []) {
    if (emp.slack_user_id) {
      slackIdToEmployeeId.set(emp.slack_user_id, emp.id);
    }
  }

  const users: SlackUser[] = activeMembers.map((m) => {
    const employeeId = m.id ? slackIdToEmployeeId.get(m.id) ?? null : null;
    return {
      employee_id: employeeId,
      slack_user_id: m.id ?? "",
      name: m.real_name ?? m.name ?? "",
      display_name:
        m.profile?.display_name || m.real_name || m.name || "",
      avatar_url: m.profile?.image_48 ?? null,
    };
  });

  // Exclude the current user
  return users.filter((u) => u.employee_id !== currentEmployeeId);
}
