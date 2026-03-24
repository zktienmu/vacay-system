import "server-only";

const ASANA_API = "https://app.asana.com/api/1.0";

const token = process.env.ASANA_ACCESS_TOKEN;
const projectGid = process.env.ASANA_PROJECT_GID;

const isConfigured = !!(token && projectGid);

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

interface CreateHandoverTaskParams {
  assigneeGid: string; // Asana user GID of the delegate
  employeeName: string; // Person going on leave
  handoverNote: string | null;
  delegateName: string;
  startDate: string; // ISO date
  endDate: string; // ISO date
}

/**
 * Create a handover task in the configured Asana project.
 * Returns the task GID on success, or null on failure.
 * Fire-and-forget: errors are logged, never thrown.
 */
export async function createHandoverTask(
  params: CreateHandoverTaskParams,
): Promise<string | null> {
  if (!isConfigured) {
    console.debug("[Asana] Not configured, skipping createHandoverTask");
    return null;
  }

  const { assigneeGid, employeeName, handoverNote, delegateName, startDate, endDate } = params;

  const dateLabel = `${startDate.slice(5).replace("-", "/")}–${endDate.slice(5).replace("-", "/")}`;
  const name = handoverNote
    ? `🏖️ [${employeeName} 休假交接] ${handoverNote} (${dateLabel})`
    : `🏖️ [${employeeName} 休假交接] 代理人：${delegateName} (${dateLabel})`;

  const notes = [
    `${employeeName} 休假期間：${startDate} ~ ${endDate}`,
    `代理人：${delegateName}`,
    handoverNote ? `\n交接事項：\n${handoverNote}` : "",
    "\n— 由 Vaca 休假系統自動建立",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch(`${ASANA_API}/tasks`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        data: {
          name,
          notes,
          assignee: assigneeGid,
          due_on: endDate,
          start_on: startDate,
          projects: [projectGid],
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[Asana] Failed to create task:", res.status, body);
      return null;
    }

    const json = await res.json();
    const taskGid = json.data?.gid ?? null;
    if (taskGid) {
      console.log("[Asana] Created handover task:", taskGid);
    }
    return taskGid;
  } catch (error) {
    console.error("[Asana] Failed to create task:", error);
    return null;
  }
}

/**
 * Mark an Asana task as completed.
 * Fire-and-forget: errors are logged, never thrown.
 */
export async function completeAsanaTask(taskGid: string): Promise<void> {
  if (!isConfigured) return;

  try {
    const res = await fetch(`${ASANA_API}/tasks/${taskGid}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ data: { completed: true } }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[Asana] Failed to complete task:", taskGid, res.status, body);
    }
  } catch (error) {
    console.error("[Asana] Failed to complete task:", taskGid, error);
  }
}

/**
 * Delete an Asana task.
 * Fire-and-forget: errors are logged, never thrown.
 */
export async function deleteAsanaTask(taskGid: string): Promise<void> {
  if (!isConfigured) return;

  try {
    const res = await fetch(`${ASANA_API}/tasks/${taskGid}`, {
      method: "DELETE",
      headers: headers(),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[Asana] Failed to delete task:", taskGid, res.status, body);
    }
  } catch (error) {
    console.error("[Asana] Failed to delete task:", taskGid, error);
  }
}
