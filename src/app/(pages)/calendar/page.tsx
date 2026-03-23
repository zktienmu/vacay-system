"use client";

import { useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import { useTranslation } from "@/lib/i18n/context";
import { getLeaveTypeEmoji } from "@/components/LeaveTypeIcon";
import type { ApiResponse, LeaveType, PublicHoliday } from "@/types";

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
  color: string;
  allDay?: boolean;
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    async function fetchCalendarData() {
      try {
        const [leaveRes, holidayRes] = await Promise.all([
          fetch("/api/calendar"),
          fetch("/api/holidays"),
        ]);
        const leaveJson: ApiResponse<CalendarEvent[]> = await leaveRes.json();
        const holidayJson: ApiResponse<PublicHoliday[]> = await holidayRes.json();

        if (!leaveJson.success || !leaveJson.data) {
          throw new Error(leaveJson.error || "Failed to fetch calendar data");
        }

        // API already returns pre-formatted calendar events
        const calEvents: CalendarEvent[] = [...leaveJson.data];

        // Add public holidays as calendar events
        if (holidayJson.success && holidayJson.data) {
          for (const holiday of holidayJson.data) {
            const endDate = new Date(holiday.date);
            endDate.setDate(endDate.getDate() + 1);

            calEvents.push({
              id: `holiday-${holiday.id}`,
              title: `\uD83C\uDDF9\uD83C\uDDFC ${holiday.name}`,
              start: holiday.date,
              end: endDate.toISOString().split("T")[0],
              color: "#F59E0B",
              allDay: true,
            });
          }
        }

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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("calendar.title")}</h1>
        <p className="text-gray-500 dark:text-gray-400">
          {t("calendar.description")}
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
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {getLeaveTypeEmoji(type)} {t(`leave.types.${type}` as `leave.types.${LeaveType}`)}
              </span>
            </div>
          )
        )}
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: "#F59E0B" }}
          />
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {"\uD83C\uDDF9\uD83C\uDDFC"} {t("calendar.publicHoliday")}
          </span>
        </div>
      </div>

      {/* Calendar */}
      {isLoading ? (
        <div className="flex h-96 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500 dark:border-gray-700 dark:border-t-blue-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("calendar.loadingCalendar")}</p>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
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
