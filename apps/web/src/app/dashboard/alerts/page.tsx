"use client";

import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { Button as ShadcnButton } from "@/components/ui/button";
import {
  Card as ShadcnCard,
  CardContent,
} from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { alertStatusVariant, StatusBadge } from "@/components/ui/status-badge";
import {
  type AlertItem,
  type AlertMetrics,
  type AutomationRuleItem,
  createAutomationRule,
  deleteAutomationRule,
  formatAlertDate,
  formatAlertMoney,
  formatReminderSent,
  getAlertsSummary,
  resendPaymentReminder,
  ruleTypeLabel,
  runAutomationRule,
  triggerTypeLabel,
  toggleAutomationRule,
} from "@/lib/alerts-api";
import { cn } from "@/lib/utils";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  AlertTriangle,
  CalendarClock,
  Mail,
  Settings2,
} from "lucide-react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Modal,
  Select,
  Spinner,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-secondary bg-secondary/15 text-secondary"
          : "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function AlertsHubPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const {
    formatBaseMoney,
    loading: currencyLoading,
  } = useOrgCurrency();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMainTab, setSelectedMainTab] = useState(0);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [rules, setRules] = useState<AutomationRuleItem[]>([]);
  const [metrics, setMetrics] = useState<AlertMetrics | null>(null);
  const [filterTab, setFilterTab] = useState<"All" | "Overdue" | "Due Soon">("All");

  const [emailModalAlert, setEmailModalAlert] = useState<AlertItem | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const [createRuleOpen, setCreateRuleOpen] = useState(false);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleType, setNewRuleType] = useState<"customer_payment" | "internal_follow_up">("internal_follow_up");
  const [newRuleTriggerType, setNewRuleTriggerType] = useState<"days_before_due" | "days_after_due" | "weekly_digest">("days_after_due");
  const [newRuleDays, setNewRuleDays] = useState("3");
  const [newRuleRecipient, setNewRuleRecipient] = useState("");
  const [newRuleDesc, setNewRuleDesc] = useState("");
  const [runningRuleId, setRunningRuleId] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const summary = await getAlertsSummary();
      setAlerts(summary.alerts);
      setRules(summary.automationRules);
      setMetrics(summary.metrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const mainTabs = [
    {
      id: "tab-alerts",
      content: `Active Payment Alerts (${alerts.length})`,
    },
    {
      id: "tab-rules",
      content: `Automated Email Rules (${rules.filter((rule) => rule.enabled).length} Active)`,
    },
  ];

  const filteredAlerts = alerts.filter((alert) => {
    if (filterTab === "All") return true;
    if (filterTab === "Overdue") {
      return alert.status === "Overdue" || alert.status === "Credit Risk";
    }
    return alert.status === filterTab;
  });

  const overdueCount =
    alerts.filter(
      (alert) => alert.status === "Overdue" || alert.status === "Credit Risk",
    ).length;
  const dueSoonCount = alerts.filter((alert) => alert.status === "Due Soon").length;

  const handleOpenEmailModal = (alert: AlertItem) => {
    setEmailModalAlert(alert);
    setRecipientEmail(alert.customerEmail);
    setCustomNote("");
  };

  const handleSendEmailReminder = async () => {
    if (!emailModalAlert) return;
    setIsSendingEmail(true);

    try {
      const result = await resendPaymentReminder({
        alertId: emailModalAlert.id,
        customerEmail: recipientEmail,
        customMessage: customNote || undefined,
      });

      setAlerts((prev) =>
        prev.map((alert) =>
          alert.id === emailModalAlert.id
            ? { ...alert, lastReminderSent: result.lastReminderSent }
            : alert,
        ),
      );

      setMetrics((prev) =>
        prev
          ? {
              ...prev,
              remindersSentThisWeek: prev.remindersSentThisWeek + 1,
            }
          : prev,
      );

      showSuccess(result.message);
      setEmailModalAlert(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to send reminder");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleCreateRule = async () => {
    if (!newRuleName || !newRuleDesc) return;

    const triggerDays =
      newRuleTriggerType === "weekly_digest" ? null : Number(newRuleDays) || 0;

    if (newRuleType === "internal_follow_up" && !newRuleRecipient.trim()) {
      showError("Recipient email is required for internal follow-up rules.");
      return;
    }

    const triggerCondition =
      newRuleTriggerType === "weekly_digest"
        ? "Every Monday at 8:00 AM"
        : newRuleTriggerType === "days_before_due"
          ? `${triggerDays} day(s) before invoice due date`
          : `${triggerDays} day(s) after invoice due date`;

    try {
      const result = await createAutomationRule({
        name: newRuleName,
        ruleType: newRuleType,
        triggerType: newRuleTriggerType,
        triggerDays,
        recipientEmail: newRuleRecipient.trim() || null,
        triggerCondition,
        description: newRuleDesc,
      });

      setRules((prev) => [...prev, result.rule]);
      setMetrics((prev) =>
        prev
          ? {
              ...prev,
              activeAutomationRulesCount: prev.activeAutomationRulesCount + 1,
              totalAutomationRulesCount: prev.totalAutomationRulesCount + 1,
            }
          : prev,
      );

      showSuccess(`Automation rule "${result.rule.title}" created.`);
      setNewRuleName("");
      setNewRuleType("internal_follow_up");
      setNewRuleTriggerType("days_after_due");
      setNewRuleDays("3");
      setNewRuleRecipient("");
      setNewRuleDesc("");
      setCreateRuleOpen(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to create rule");
    }
  };

  const handleRunRule = async (rule: AutomationRuleItem) => {
    setRunningRuleId(rule.id);

    try {
      const result = await runAutomationRule(rule.id);
      await loadAlerts();
      showSuccess(
        result.sentCount > 0
          ? `Rule ran successfully. ${result.sentCount} email(s) sent.`
          : "Rule ran. No matching invoices needed a reminder right now.",
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to run rule");
    } finally {
      setRunningRuleId(null);
    }
  };

  const handleToggleRule = async (id: string, currentEnabled: boolean) => {
    try {
      const result = await toggleAutomationRule(id, !currentEnabled);
      setRules((prev) =>
        prev.map((rule) => (rule.id === id ? result.rule : rule)),
      );
      setMetrics((prev) => {
        if (!prev) return prev;
        const delta = result.rule.enabled ? 1 : -1;
        return {
          ...prev,
          activeAutomationRulesCount: Math.max(
            0,
            prev.activeAutomationRulesCount + delta,
          ),
        };
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update rule");
    }
  };

  const handleDeleteRule = async (id: string, ruleTitle: string) => {
    try {
      await deleteAutomationRule(id);
      const deletedRule = rules.find((rule) => rule.id === id);
      setRules((prev) => prev.filter((rule) => rule.id !== id));
      setMetrics((prev) => {
        if (!prev || !deletedRule) return prev;
        return {
          ...prev,
          activeAutomationRulesCount: deletedRule.enabled
            ? Math.max(0, prev.activeAutomationRulesCount - 1)
            : prev.activeAutomationRulesCount,
          totalAutomationRulesCount: Math.max(
            0,
            prev.totalAutomationRulesCount - 1,
          ),
        };
      });
      showSuccess(`Automation rule "${ruleTitle}" deleted.`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete rule");
    }
  };

  if (loading) {
    return (
      <AppPage
        subtitle="Central command center for overdue invoice alerts, customer payment email reminders, and automated collection schedules."
        title="Alerts & Payment Reminders"
      >
        <InlineStack align="center" blockAlign="center" gap="200">
          <Spinner size="small" />
          <Text as="p" tone="subdued">
            Loading payment alerts...
          </Text>
        </InlineStack>
      </AppPage>
    );
  }

  return (
    <AppPage
      subtitle="Central command center for overdue invoice alerts, customer payment email reminders, and automated collection schedules."
      title="Alerts & Payment Reminders"
    >
      <BlockStack gap="500">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            <p>{error}</p>
          </Banner>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={<AlertTriangle className="size-5" />}
            label="Total Overdue"
            value={formatBaseMoney(metrics?.totalOverdueAmount ?? 0)}
            hint={`${metrics?.totalOverdueCount ?? 0} accounts overdue`}
            tone="warning"
            loading={loading || currencyLoading}
          />
          <KpiCard
            icon={<CalendarClock className="size-5" />}
            label="Due Within 7 Days"
            value={formatBaseMoney(metrics?.totalDueSoonAmount ?? 0)}
            hint={`${metrics?.totalDueSoonCount ?? 0} pending invoices`}
            tone="default"
            loading={loading || currencyLoading}
          />
          <KpiCard
            icon={<Mail className="size-5" />}
            label="Auto-Emails Sent"
            value={`${metrics?.remindersSentThisWeek ?? 0} reminders`}
            hint="Sent this week"
            tone="default"
          />
          <KpiCard
            icon={<Settings2 className="size-5" />}
            label="Automation Rules"
            value={`${metrics?.activeAutomationRulesCount ?? 0} / ${metrics?.totalAutomationRulesCount ?? rules.length} active`}
            hint="Automated schedules enabled"
            tone="success"
          />
        </div>

        <Card padding="0">
          <Tabs
            tabs={mainTabs}
            selected={selectedMainTab}
            onSelect={setSelectedMainTab}
          />
        </Card>

        {selectedMainTab === 0 ? (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Payment Collection & Invoice Alerts
                  </Text>
                  <Text as="p" tone="subdued">
                    Live alerts from posted invoices with outstanding balances
                  </Text>
                </BlockStack>

                <InlineStack gap="200">
                  <FilterButton
                    active={filterTab === "All"}
                    onClick={() => setFilterTab("All")}
                  >
                    All ({alerts.length})
                  </FilterButton>
                  <FilterButton
                    active={filterTab === "Overdue"}
                    onClick={() => setFilterTab("Overdue")}
                  >
                    Overdue ({overdueCount})
                  </FilterButton>
                  <FilterButton
                    active={filterTab === "Due Soon"}
                    onClick={() => setFilterTab("Due Soon")}
                  >
                    Due Soon ({dueSoonCount})
                  </FilterButton>
                  <Button onClick={() => router.push("/dashboard/invoices")}>
                    View Invoices
                  </Button>
                </InlineStack>
              </InlineStack>

              <div className="flex flex-col gap-3">
                {filteredAlerts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center text-sm text-muted-foreground">
                    No invoice alerts matching this filter. Alerts appear when posted
                    invoices are overdue or due within 7 days.
                  </div>
                ) : (
                  filteredAlerts.map((alert) => {
                    const isOverdue =
                      alert.status === "Overdue" || alert.status === "Credit Risk";

                    return (
                      <ShadcnCard
                        key={alert.id}
                        className={cn(
                          "transition-shadow hover:shadow-md",
                          isOverdue && "border-destructive/40 ring-1 ring-destructive/20",
                        )}
                      >
                        <CardContent className="flex flex-col gap-4 pt-0 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-foreground">
                                {alert.invoiceNumber}
                              </span>
                              <StatusBadge variant={alertStatusVariant(alert.status)}>
                                {alert.status}
                              </StatusBadge>
                              {alert.daysOverdue > 0 ? (
                                <span className="text-sm font-semibold text-destructive">
                                  {alert.daysOverdue} days overdue
                                </span>
                              ) : null}
                            </div>

                            <div className="text-sm">
                              <span className="font-semibold text-foreground">
                                {alert.customerName}
                              </span>
                              {alert.customerEmail ? (
                                <span className="text-muted-foreground">
                                  {" "}
                                  ({alert.customerEmail})
                                </span>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span>Due date: {formatAlertDate(alert.dueDate)}</span>
                              <span>
                                Last email: {formatReminderSent(alert.lastReminderSent)}
                              </span>
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                            <div className="text-xl font-bold text-foreground">
                              {formatAlertMoney(
                                alert.amountOutstanding,
                                alert.currency,
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <ShadcnButton
                                variant="secondary"
                                size="sm"
                                onClick={() => handleOpenEmailModal(alert)}
                              >
                                Resend reminder
                              </ShadcnButton>
                              <ShadcnButton
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  router.push(`/dashboard/invoices/${alert.invoiceId}`)
                                }
                              >
                                View invoice
                              </ShadcnButton>
                            </div>
                          </div>
                        </CardContent>
                      </ShadcnCard>
                    );
                  })
                )}
              </div>
            </BlockStack>
          </Card>
        ) : (
          <Card>
            <BlockStack gap="400">
              <Banner tone="info">
                <p>
                  Background jobs check active rules every 15 minutes and send emails
                  when invoices match the schedule. Configure SMTP in your API
                  environment to deliver real emails; otherwise messages are logged
                  in the API console.
                </p>
              </Banner>

              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Automated Email Notification Rules
                  </Text>
                  <Text as="p" tone="subdued">
                    Schedule customer payment reminders or internal follow-up emails
                    so your team does not forget to chase overdue invoices
                  </Text>
                </BlockStack>
                <ShadcnButton onClick={() => setCreateRuleOpen(true)}>
                  + Create Automation Rule
                </ShadcnButton>
              </InlineStack>

              <div className="flex flex-col gap-3">
                {rules.map((rule) => (
                  <ShadcnCard key={rule.id} className="transition-shadow hover:shadow-md">
                    <CardContent className="flex flex-col gap-4 pt-0 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-foreground">{rule.title}</span>
                          <StatusBadge variant={rule.enabled ? "success" : "neutral"}>
                            {rule.enabled ? "Active" : "Disabled"}
                          </StatusBadge>
                          <StatusBadge
                            variant={
                              rule.ruleType === "internal_follow_up" ? "info" : "neutral"
                            }
                          >
                            {ruleTypeLabel(rule.ruleType)}
                          </StatusBadge>
                        </div>
                        <p className="text-sm text-muted-foreground">{rule.description}</p>
                        <p className="text-xs font-medium text-secondary">
                          Schedule: {triggerTypeLabel(rule)}
                        </p>
                        {rule.recipientEmail ? (
                          <p className="text-xs text-muted-foreground">
                            Sends to: {rule.recipientEmail}
                          </p>
                        ) : null}
                        {rule.lastRunAt ? (
                          <p className="text-xs text-muted-foreground">
                            Last run: {formatReminderSent(rule.lastRunAt)}
                          </p>
                        ) : null}
                      </div>

                      <InlineStack gap="200">
                        <Button
                          loading={runningRuleId === rule.id}
                          onClick={() => handleRunRule(rule)}
                        >
                          Run Now
                        </Button>
                        <Button onClick={() => handleToggleRule(rule.id, rule.enabled)}>
                          {rule.enabled ? "Disable Rule" : "Enable Rule"}
                        </Button>
                        <Button
                          tone="critical"
                          variant="plain"
                          onClick={() => handleDeleteRule(rule.id, rule.title)}
                        >
                          Delete
                        </Button>
                      </InlineStack>
                    </CardContent>
                  </ShadcnCard>
                ))}
              </div>
            </BlockStack>
          </Card>
        )}
      </BlockStack>

      {createRuleOpen ? (
        <Modal
          open={createRuleOpen}
          onClose={() => setCreateRuleOpen(false)}
          title="Create New Automation Rule"
          primaryAction={{
            content: "Save Automation Rule",
            onAction: handleCreateRule,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setCreateRuleOpen(false),
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <TextField
                autoComplete="off"
                label="Rule Name"
                placeholder="e.g. Follow up 3 days after due date"
                value={newRuleName}
                onChange={setNewRuleName}
              />
              <Select
                label="Who should receive this email?"
                options={[
                  {
                    label: "Internal team follow-up (remind staff to chase client)",
                    value: "internal_follow_up",
                  },
                  {
                    label: "Customer payment reminder",
                    value: "customer_payment",
                  },
                ]}
                value={newRuleType}
                onChange={(value) =>
                  setNewRuleType(value as "customer_payment" | "internal_follow_up")
                }
              />
              <Select
                label="When should this run?"
                options={[
                  {
                    label: "X days after invoice due date",
                    value: "days_after_due",
                  },
                  {
                    label: "X days before invoice due date",
                    value: "days_before_due",
                  },
                  {
                    label: "Weekly digest (Monday 8:00 AM)",
                    value: "weekly_digest",
                  },
                ]}
                value={newRuleTriggerType}
                onChange={(value) =>
                  setNewRuleTriggerType(
                    value as "days_before_due" | "days_after_due" | "weekly_digest",
                  )
                }
              />
              {newRuleTriggerType !== "weekly_digest" ? (
                <TextField
                  autoComplete="off"
                  label="Number of days"
                  type="number"
                  value={newRuleDays}
                  onChange={setNewRuleDays}
                />
              ) : null}
              {newRuleType === "internal_follow_up" ||
              newRuleTriggerType === "weekly_digest" ? (
                <TextField
                  autoComplete="email"
                  label="Recipient email"
                  placeholder="e.g. finance@yourcompany.com"
                  value={newRuleRecipient}
                  onChange={setNewRuleRecipient}
                />
              ) : null}
              <TextField
                autoComplete="off"
                label="What should happen?"
                multiline={3}
                placeholder="e.g. Email finance team to call the client and confirm payment status"
                value={newRuleDesc}
                onChange={setNewRuleDesc}
              />
            </BlockStack>
          </Modal.Section>
        </Modal>
      ) : null}

      {emailModalAlert ? (
        <Modal
          open={Boolean(emailModalAlert)}
          onClose={() => setEmailModalAlert(null)}
          title={`Resend Payment Reminder   Invoice ${emailModalAlert.invoiceNumber}`}
          primaryAction={{
            content: isSendingEmail ? "Sending Email..." : "Send Reminder Email Now",
            loading: isSendingEmail,
            onAction: handleSendEmailReminder,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setEmailModalAlert(null),
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <TextField
                autoComplete="email"
                label="Recipient Customer Email"
                value={recipientEmail}
                onChange={setRecipientEmail}
              />

              <div className="frogmen-email-preview-box">
                <div className="frogmen-email-field">
                  <strong>Subject:</strong> [PAYMENT NOTICE] Urgent: Overdue Invoice{" "}
                  {emailModalAlert.invoiceNumber}
                </div>
                <div className="frogmen-email-field">
                  <strong>Customer:</strong> {emailModalAlert.customerName}
                </div>
                <div className="frogmen-email-field">
                  <strong>Amount Due:</strong>{" "}
                  {formatAlertMoney(
                    emailModalAlert.amountOutstanding,
                    emailModalAlert.currency,
                  )}{" "}
                  (Due: {formatAlertDate(emailModalAlert.dueDate)})
                </div>

                <div className="frogmen-email-body-text">
                  Dear {emailModalAlert.customerName} Accounts Team,
                  <br />
                  <br />
                  This is a payment notice regarding Invoice{" "}
                  <strong>{emailModalAlert.invoiceNumber}</strong> in the amount of{" "}
                  <strong>
                    {formatAlertMoney(
                      emailModalAlert.amountOutstanding,
                      emailModalAlert.currency,
                    )}
                  </strong>
                  , which was due on {formatAlertDate(emailModalAlert.dueDate)}.
                  <br />
                  <br />
                  Please arrange payment at your earliest convenience or contact our
                  finance department if payment has already been initiated.
                  <br />
                  <br />
                  Thank you for your prompt attention.
                  <br />
                  Frogmen Finance & Accounts Team
                </div>
              </div>

              <TextField
                autoComplete="off"
                label="Add Custom Note to Email (Optional)"
                multiline={3}
                placeholder="e.g. Please note our updated bank details attached..."
                value={customNote}
                onChange={setCustomNote}
              />
            </BlockStack>
          </Modal.Section>
        </Modal>
      ) : null}
    </AppPage>
  );
}
