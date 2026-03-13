"use client";

import { useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import type { ApiResponse, LeaveRequestWithEmployee, LeaveType } from "@/types";
import { getLeaveTypeEmoji, getLeaveTypeLabel } from "@/components/LeaveTypeIcon";

const leaveTypeColors: Record<LeaveType, string> = {
  annual: "#3B82F6",    // blue
  personal: "#8B5CF6",  // purple
  sick: "#EF4444",      // red
  official: "#14B8A6",  // teal
  unpaid: "#6B7280",    // gray
  remote: "#22C55E",    // green
};

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    leaveType: LeaveType;
    employeeName: string;
  };
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCalendarData() {
      try {
        const res = await fetch("/api/calendar");
        const json: ApiResponse<LeaveRequestWithEmployee[]> = await res.json();
        if (!json.success || !json.data) {
          throw new Error(json.error || "Failed to fetch calendar data");
        }

        const calEvents: CalendarEvent[] = json.data.map((leave) => {
          const emoji = getLeaveTypeEmoji(leave.leave_type);
          const typeName = getLeaveTypeLabel(leave.leave_type);
          const name = leave.employee?.name || "Unknown";
          const color = leaveTypeColors[leave.leave_type];

          // FullCalendar end date is exclusive, so add one day
          const endDate = new Date(leave.end_date);
          endDate.setDate(endDate.getDate() + 1);

          return {
            id: leave.id,
            title: `${emoji} ${name} - ${typeName}`,
            start: leave.start_date,
            end: endDate.toISOString().split("T")[0],
            backgroundColor: color,
            borderColor: color,
            textColor: "#ffffff",
            extendedProps: {
              leaveType: leave.leave_type,
              employeeName: name,
            },
          };
        });

        setEvents(calEvents);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load calendar");
      } finally {
        setIsLoading(false);
      }
    }

    fetchCalendarData();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team Calendar</h1>
        <p className="text-gray-500">
          View approved leaves across the team.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {(Object.entries(leaveTypeColors) as [LeaveType, string][]).map(
          ([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs text-gray-600">
                {getLeaveTypeEmoji(type)} {getLeaveTypeLabel(type)}
              </span>
            </div>
          )
        )}
      </div>

      {/* Calendar */}
      {isLoading ? (
        <div className="flex h-96 items-center justify-center rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
            <p className="text-sm text-gray-500">Loading calendar...</p>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-red-700">
          {error}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <FullCalendar
            plugins={[dayGridPlugin]}
            initialView="dayGridMonth"
            events={events}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth",
            }}
            height="auto"
            eventDisplay="block"
            dayMaxEvents={3}
            weekends={true}
          />
        </div>
      )}
    </div>
  );
}
