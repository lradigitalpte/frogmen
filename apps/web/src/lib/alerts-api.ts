import { apiFetch } from "./api";

export type AlertStatus = "Overdue" | "Due Soon" | "Credit Risk";
export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertItem {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  amountOutstanding: number;
  amountOutstandingBase?: number;
  currency: string;
  dueDate: string;
  daysOverdue: number;
  status: AlertStatus;
  severity: AlertSeverity;
  lastReminderSent?: string;
}

export interface AutomationRuleItem {
  id: string;
  title: string;
  name: string;
  triggerCondition: string;
  description: string;
  enabled: boolean;
  ruleType: "customer_payment" | "internal_follow_up";
  triggerType: "days_before_due" | "days_after_due" | "weekly_digest";
  triggerDays: number | null;
  recipientEmail: string | null;
  lastRunAt?: string;
}

export interface AlertMetrics {
  totalOverdueAmount: number;
  totalOverdueCount: number;
  totalDueSoonAmount: number;
  totalDueSoonCount: number;
  remindersSentThisWeek: number;
  activeAutomationRulesCount: number;
  totalAutomationRulesCount: number;
}

export interface AlertsSummary {
  alerts: AlertItem[];
  automationRules: AutomationRuleItem[];
  metrics: AlertMetrics;
}

export function getAlertsSummary() {
  return apiFetch<AlertsSummary>("/api/v1/alerts").then(normalizeAlertsSummary);
}

export function getAlertMetrics() {
  return apiFetch<AlertMetrics>("/api/v1/alerts/metrics");
}

export function getOverdueAlertCount() {
  return apiFetch<{ count: number }>("/api/v1/alerts/overdue-count");
}

export function resendPaymentReminder(input: {
  alertId: string;
  customerEmail: string;
  customMessage?: string;
}) {
  return apiFetch<{
    success: boolean;
    message: string;
    dispatchedAt: string;
    invoiceNumber: string;
    recipient: string;
    lastReminderSent: string;
  }>("/api/v1/alerts/resend-reminder", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createAutomationRule(input: {
  name: string;
  ruleType: "customer_payment" | "internal_follow_up";
  triggerType: "days_before_due" | "days_after_due" | "weekly_digest";
  triggerDays?: number | null;
  recipientEmail?: string | null;
  triggerCondition: string;
  description: string;
}) {
  return apiFetch<{ success: boolean; rule: AutomationRuleItem }>(
    "/api/v1/alerts/automation-rules/create",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function deleteAutomationRule(id: string) {
  return apiFetch<{ success: boolean; deletedId: string }>(
    `/api/v1/alerts/automation-rules/${id}`,
    {
      method: "DELETE",
    },
  );
}

export function runAutomationRule(id: string) {
  return apiFetch<{ success: boolean; sentCount: number }>(
    `/api/v1/alerts/automation-rules/${id}/run`,
    {
      method: "POST",
    },
  );
}

export function runReminderJobs() {
  return apiFetch<{ success: boolean; sentCount: number }>(
    "/api/v1/alerts/jobs/run",
    {
      method: "POST",
    },
  );
}

export function ruleTypeLabel(ruleType: AutomationRuleItem["ruleType"]) {
  return ruleType === "internal_follow_up"
    ? "Internal follow-up"
    : "Customer reminder";
}

export function triggerTypeLabel(rule: AutomationRuleItem) {
  if (rule.triggerType === "weekly_digest") {
    return "Every Monday at 8:00 AM";
  }

  if (rule.triggerDays != null && rule.triggerDays > 0) {
    if (rule.triggerType === "days_before_due") {
      return `${rule.triggerDays} day(s) before due date`;
    }

    return `${rule.triggerDays} day(s) after due date`;
  }

  return rule.triggerCondition;
}

export function toggleAutomationRule(id: string, enabled: boolean) {
  return apiFetch<{ success: boolean; rule: AutomationRuleItem }>(
    `/api/v1/alerts/automation-rules/${id}/toggle`,
    {
      method: "POST",
      body: JSON.stringify({ enabled }),
    },
  );
}

export function formatAlertMoney(
  amount: number | string | null | undefined,
  currency = "USD",
) {
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    return " ";
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeAlert(
  alert: AlertItem & { amount?: number | string },
): AlertItem {
  const outstanding = toNumber(alert.amountOutstanding ?? alert.amount);
  const outstandingBase = toNumber(
    alert.amountOutstandingBase ?? outstanding,
  );

  return {
    ...alert,
    amount: toNumber(alert.amount ?? outstanding),
    amountOutstanding: outstanding,
    amountOutstandingBase: outstandingBase,
  };
}

export function normalizeAlertsSummary(summary: AlertsSummary): AlertsSummary {
  return {
    ...summary,
    alerts: summary.alerts.map(normalizeAlert),
    metrics: {
      ...summary.metrics,
      totalOverdueAmount: toNumber(summary.metrics.totalOverdueAmount),
      totalDueSoonAmount: toNumber(summary.metrics.totalDueSoonAmount),
    },
  };
}

export function formatAlertDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatReminderSent(value?: string) {
  if (!value) {
    return "None yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sentDay = new Date(date);
  sentDay.setHours(0, 0, 0, 0);

  if (sentDay.getTime() === today.getTime()) {
    return "Today";
  }

  return formatAlertDate(value.slice(0, 10));
}
