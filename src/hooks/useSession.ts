"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { SessionData, ApiResponse } from "@/types";

async function fetchSession(): Promise<SessionData | null> {
  const res = await fetch("/api/auth/me");
  if (!res.ok) return null;
  const json: ApiResponse<SessionData> = await res.json();
  if (!json.success || !json.data) return null;
  return json.data;
}

export function useSession() {
  const queryClient = useQueryClient();

  const {
    data: session,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    retry: false,
    staleTime: 60_000,
  });

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    queryClient.invalidateQueries({ queryKey: ["session"] });
    queryClient.clear();
  }, [queryClient]);

  return {
    session,
    isLoading,
    isAuthenticated: !!session?.employee_id,
    logout,
    refetch,
  };
}
