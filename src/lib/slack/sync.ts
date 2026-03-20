import "server-only";
import { WebClient } from "@slack/web-api";
import { supabase } from "@/lib/supabase/client";
import type { Employee } from "@/types";

const slack: WebClient | null = process.env.SLACK_BOT_TOKEN
  ? new WebClient(process.env.SLACK_BOT_TOKEN)
  : null;

export interface SyncResult {
  matched: { employee_name: string; slack_name: string; slack_user_id: string }[];
  unmatched_employees: string[];
  unmatched_slack: { slack_user_id: string; name: string }[];
}

/**
 * Fetch all Slack workspace members and auto-match them to employees
 * by comparing names (case-insensitive, trimmed).
 * Updates the slack_user_id for matched employees.
 */
export async function syncSlackUsers(): Promise<SyncResult> {
  if (!slack) {
    throw new Error("SLACK_BOT_TOKEN not configured");
  }

  // Fetch Slack members
  const result = await slack.users.list({});
  const members = (result.members ?? []).filter(
    (m) =>
      !m.deleted &&
      !m.is_bot &&
      m.id !== "USLACKBOT" &&
      !m.is_restricted &&
      !m.is_ultra_restricted,
  );

  // Fetch all employees
  const { data: employees, error } = await supabase
    .from("employees")
    .select("*");

  if (error) throw error;
  const allEmployees = (employees ?? []) as Employee[];

  // Build a lookup: normalize name → slack member
  // Try matching by: display_name, real_name, or profile.real_name_normalized
  const slackByName = new Map<string, { id: string; name: string }>();
  for (const m of members) {
    const names = [
      m.profile?.display_name,
      m.real_name,
      m.name,
      m.profile?.real_name_normalized,
    ].filter(Boolean) as string[];

    for (const n of names) {
      const key = n.trim().toLowerCase();
      if (key && !slackByName.has(key)) {
        slackByName.set(key, { id: m.id!, name: m.real_name || m.name || "" });
      }
    }
  }

  const matched: SyncResult["matched"] = [];
  const unmatched_employees: string[] = [];
  const matchedSlackIds = new Set<string>();

  for (const emp of allEmployees) {
    // Skip if already has a slack_user_id
    if (emp.slack_user_id) {
      // Verify it's still valid
      const stillExists = members.some((m) => m.id === emp.slack_user_id);
      if (stillExists) {
        matched.push({
          employee_name: emp.name,
          slack_name: emp.name,
          slack_user_id: emp.slack_user_id,
        });
        matchedSlackIds.add(emp.slack_user_id);
        continue;
      }
      // If not valid anymore, try to re-match below
    }

    const key = emp.name.trim().toLowerCase();
    const slackMatch = slackByName.get(key);

    if (slackMatch) {
      // Update employee with slack_user_id
      await supabase
        .from("employees")
        .update({ slack_user_id: slackMatch.id })
        .eq("id", emp.id);

      matched.push({
        employee_name: emp.name,
        slack_name: slackMatch.name,
        slack_user_id: slackMatch.id,
      });
      matchedSlackIds.add(slackMatch.id);
    } else {
      unmatched_employees.push(emp.name);
    }
  }

  // Find Slack users that didn't match any employee
  const unmatched_slack = members
    .filter((m) => m.id && !matchedSlackIds.has(m.id))
    .map((m) => ({
      slack_user_id: m.id!,
      name: m.real_name || m.name || "",
    }));

  return { matched, unmatched_employees, unmatched_slack };
}
