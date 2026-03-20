"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApiResponse } from "@/types";
import type { SlackUser } from "@/lib/slack/users";

async function fetchSlackUsers(): Promise<SlackUser[]> {
  const res = await fetch("/api/slack/users");
  if (!res.ok) throw new Error("Failed to fetch Slack users");
  const json: ApiResponse<SlackUser[]> = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || "Unknown error");
  return json.data;
}

export function useSlackUsers() {
  const {
    data: slackUsers = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["slackUsers"],
    queryFn: fetchSlackUsers,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return { slackUsers, isLoading, refetch };
}
