"use client";

import { useQuery } from "@tanstack/react-query";
import type { LeaveRequestWithEmployee, ApiResponse } from "@/types";

async function fetchLeaveRequests(
  all: boolean
): Promise<LeaveRequestWithEmployee[]> {
  const url = all ? "/api/leave?all=true" : "/api/leave";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch leave requests");
  const json: ApiResponse<LeaveRequestWithEmployee[]> = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || "Unknown error");
  return json.data;
}

export function useLeaveRequests(all = false) {
  const {
    data: requests = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["leaveRequests", all],
    queryFn: () => fetchLeaveRequests(all),
  });

  return { requests, isLoading, refetch };
}
