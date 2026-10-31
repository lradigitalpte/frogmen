import type {
  CalendarEventCategory,
  CalendarItem,
  CalendarSource,
} from "@frog1/shared";
import { apiFetch } from "./api";

export type { CalendarEventCategory, CalendarItem, CalendarSource };

export interface CalendarEvent {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  category: CalendarEventCategory;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  customerId: string | null;
  vendorId: string | null;
  reminderDaysBefore: number | null;
  reminderEmails: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEventPayload {
  title: string;
  description?: string | null;
  category: CalendarEventCategory;
  startDate: string;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  customerId?: string | null;
  vendorId?: string | null;
  reminderDaysBefore?: number | null;
  reminderEmails?: string | null;
}

export interface CalendarSettings {
  organizationId: string;
  trackedCountries: string[];
  remindersEnabled: boolean;
  reminderEmails: string | null;
  digestLookaheadDays: number;
  digestHour: number;
  includeDeliveries: boolean;
  includeAnniversaries: boolean;
  includeHolidays: boolean;
  includeInvoices: boolean;
}

export interface HolidayCountry {
  code: string;
  name: string;
}

export function listCalendarItems(params: {
  from: string;
  to: string;
  sources?: CalendarSource[];
}) {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  if (params.sources?.length) search.set("sources", params.sources.join(","));
  return apiFetch<CalendarItem[]>(`/api/v1/calendar/items?${search.toString()}`);
}

export function listOverdueDeliveries() {
  return apiFetch<CalendarItem[]>("/api/v1/calendar/overdue-deliveries");
}

export function listHolidayCountries() {
  return apiFetch<HolidayCountry[]>("/api/v1/calendar/countries");
}

export function getCalendarSettings() {
  return apiFetch<CalendarSettings>("/api/v1/calendar/settings");
}

export function updateCalendarSettings(input: Partial<Omit<CalendarSettings, "organizationId">>) {
  return apiFetch<CalendarSettings>("/api/v1/calendar/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function sendCalendarDigestNow() {
  return apiFetch<{
    sent: number;
    recipients: string[];
    itemCount: number;
    message: string | null;
  }>("/api/v1/calendar/reminders/send-digest", { method: "POST" });
}

export function getCalendarEvent(id: string) {
  return apiFetch<CalendarEvent>(`/api/v1/calendar/events/${id}`);
}

export function createCalendarEvent(input: CalendarEventPayload) {
  return apiFetch<CalendarEvent>("/api/v1/calendar/events", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCalendarEvent(id: string, input: Partial<CalendarEventPayload>) {
  return apiFetch<CalendarEvent>(`/api/v1/calendar/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteCalendarEvent(id: string) {
  return apiFetch<{ success: boolean }>(`/api/v1/calendar/events/${id}`, {
    method: "DELETE",
  });
}

export const CALENDAR_SOURCE_LABELS: Record<CalendarSource, string> = {
  event: "Events",
  holiday: "Public holidays",
  purchase_order: "Expected deliveries",
  goods_receipt: "Goods received",
  invoice_due: "Invoice due dates",
  quotation_expiry: "Quotation expiry",
  warranty_expiry: "Warranty expiry",
  customer_anniversary: "Customer anniversaries",
  vendor_anniversary: "Vendor anniversaries",
};

export const CALENDAR_CATEGORY_OPTIONS: Array<{
  label: string;
  value: CalendarEventCategory;
}> = [
  { label: "Meeting", value: "meeting" },
  { label: "Reminder", value: "reminder" },
  { label: "Deadline", value: "deadline" },
  { label: "Follow-up", value: "follow_up" },
  { label: "Company holiday / closure", value: "holiday" },
  { label: "Other", value: "other" },
];

export function calendarStatusBadge(
  status: CalendarItem["status"],
): { tone: "success" | "warning" | "critical" | "attention" | "info" | undefined; label: string } | null {
  switch (status) {
    case "overdue":
      return { tone: "critical", label: "Overdue" };
    case "today":
      return { tone: "attention", label: "Today" };
    case "upcoming":
      return { tone: "info", label: "Upcoming" };
    case "done":
      return { tone: "success", label: "Done" };
    case "paid":
      return { tone: "success", label: "Paid" };
    case "late":
      return { tone: "warning", label: "Delivered late" };
    case "draft":
      return { tone: undefined, label: "Draft" };
    default:
      return null;
  }
}

/** YYYY-MM-DD in the browser's local time zone. */
export function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
