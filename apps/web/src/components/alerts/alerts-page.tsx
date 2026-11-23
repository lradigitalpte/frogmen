"use client";

import {
  ActionList,
  Badge,
  Banner,
  BlockStack,
  Button,
  ButtonGroup,
  Card,
  FormLayout,
  Icon,
  IndexTable,
  InlineStack,
  Modal,
  Popover,
  Select,
  SkeletonBodyText,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  CalendarTimeIcon,
  CheckCircleIcon,
  EmailIcon,
  MenuHorizontalIcon,
  PersonIcon,
  PlusIcon,
  SearchIcon,
  TeamIcon,
} from "@shopify/polaris-icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { useOrgCurrency } from "@/hooks/use-org-currency";
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
  runAutomationRule,
  toggleAutomationRule,
  triggerTypeLabel,
} from "@/lib/alerts-api";
import { cn } from "@/lib/utils";

type Filter = "all" | "overdue" | "soon";
type Sort = "oldest" | "amount" | "due";
type Bucket = "soon" | "1-30" | "31-60" | "61-90" | "90+";
type RuleType = AutomationRuleItem["ruleType"];
type TriggerType = AutomationRuleItem["triggerType"];

const BUCKETS: Array<{ id: Bucket; label: string; hint: string }> = [
  { id: "soon", label: "Due this week", hint: "not late yet" },
  { id: "1-30", label: "1–30 days late", hint: "overdue" },
  { id: "31-60", label: "31–60 days late", hint: "overdue" },
  { id: "61-90", label: "61–90 days late", hint: "overdue" },
  { id: "90+", label: "90+ days late", hint: "at risk" },
];

function bucketOf(alert: AlertItem): Bucket {
  if (alert.status === "Due Soon" || alert.daysOverdue <= 0) return "soon";
  if (alert.daysOverdue <= 30) return "1-30";
  if (alert.daysOverdue <= 60) return "31-60";
  if (alert.daysOverdue <= 90) return "61-90";
  return "90+";
}

function isOverdue(alert: AlertItem) {
  return alert.status === "Overdue" || alert.status === "Credit Risk";
}

interface RuleDraft {
  name: string;
  ruleType: RuleType;
  triggerType: TriggerType;
  days: string;
  recipient: string;
  description: string;
}

const EMPTY_DRAFT: RuleDraft = {
  name: "",
  ruleType: "customer_payment",
  triggerType: "days_after_due",
  days: "3",
  recipient: "",
  description: "",
};

const STARTER_RULES: Array<RuleDraft & { blurb: string }> = [
  {
    name: "Friendly heads-up before the due date",
    blurb: "Email the customer 3 days before payment is due.",
    ruleType: "customer_payment",
    triggerType: "days_before_due",
    days: "3",
    recipient: "",
    description: "Send the customer a polite reminder that their invoice is due soon.",
  },
  {
    name: "First overdue reminder",
    blurb: "Email the customer the day after an invoice becomes overdue.",
    ruleType: "customer_payment",
    triggerType: "days_after_due",
    days: "1",
    recipient: "",
    description: "Let the customer know the invoice is now overdue and ask them to arrange payment.",
  },
  {
    name: "Ask the team to call the customer",
    blurb: "Tell your finance team when an invoice is a week late.",
    ruleType: "internal_follow_up",
    triggerType: "days_after_due",
    days: "7",
    recipient: "",
    description: "Email finance to phone the customer and confirm when payment will be made.",
  },
  {
    name: "Monday overdue summary",
    blurb: "Send your team a list of everything overdue each Monday.",
    ruleType: "internal_follow_up",
    triggerType: "weekly_digest",
    days: "",
    recipient: "",
    description: "Weekly summary of all overdue invoices for the finance team.",
  },
];

function scheduleSentence(triggerType: TriggerType, days: number | null) {
  if (triggerType === "weekly_digest") return "Every Monday at 8:00";
  const n = days ?? 0;
  if (triggerType === "days_before_due") return `${n} day${n === 1 ? "" : "s"} before the due date`;
  return `${n} day${n === 1 ? "" : "s"} after the due date`;
}

export function AlertsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showSuccess, showError } = useToast();
  const { formatBaseMoney } = useOrgCurrency();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [rules, setRules] = useState<AutomationRuleItem[]>([]);
  const [metrics, setMetrics] = useState<AlertMetrics | null>(null);

  const [tab, setTab] = useState(searchParams.get("tab") === "automations" ? 1 : 0);
  const [filter, setFilter] = useState<Filter>("all");
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("oldest");
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const [reminderFor, setReminderFor] = useState<AlertItem | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [sendingReminder, setSendingReminder] = useState(false);

  const [ruleOpen, setRuleOpen] = useState(false);
  const [draft, setDraft] = useState<RuleDraft>(EMPTY_DRAFT);
  const [savingRule, setSavingRule] = useState(false);
  const [runningRuleId, setRunningRuleId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteRule, setDeleteRule] = useState<AutomationRuleItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
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
    void load();
  }, [load]);

  function changeTab(index: number) {
    setTab(index);
    const url = new URL(window.location.href);
    if (index === 1) url.searchParams.set("tab", "automations");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.toString());
  }

  // ── Alerts ──────────────────────────────────────────────────
  const overdueCount = alerts.filter(isOverdue).length;
  const soonCount = alerts.length - overdueCount;

  const bucketTotals = useMemo(() => {
    const totals = new Map<Bucket, { count: number; amount: number }>();
    for (const b of BUCKETS) totals.set(b.id, { count: 0, amount: 0 });
    for (const alert of alerts) {
      const entry = totals.get(bucketOf(alert))!;
      entry.count += 1;
      entry.amount += alert.amountOutstandingBase ?? alert.amountOutstanding;
    }
    return totals;
  }, [alerts]);

  const visibleAlerts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return alerts
      .filter((alert) => {
        if (filter === "overdue" && !isOverdue(alert)) return false;
        if (filter === "soon" && isOverdue(alert)) return false;
        if (bucket && bucketOf(alert) !== bucket) return false;
        if (q && ![alert.invoiceNumber, alert.customerName, alert.customerEmail].some((v) => (v || "").toLowerCase().includes(q))) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === "amount") return (b.amountOutstandingBase ?? b.amountOutstanding) - (a.amountOutstandingBase ?? a.amountOutstanding);
        if (sort === "due") return a.dueDate.localeCompare(b.dueDate);
        return b.daysOverdue - a.daysOverdue;
      });
  }, [alerts, filter, bucket, search, sort]);

  function openReminder(alert: AlertItem) {
    setReminderFor(alert);
    setRecipientEmail(alert.customerEmail);
    setCustomNote("");
  }

  async function sendReminder() {
    if (!reminderFor) return;
    if (!recipientEmail.includes("@")) {
      showError("Enter a valid email address.");
      return;
    }
    setSendingReminder(true);
    try {
      const result = await resendPaymentReminder({
        alertId: reminderFor.id,
        customerEmail: recipientEmail.trim(),
        customMessage: customNote.trim() || undefined,
      });
      setAlerts((prev) =>
        prev.map((a) => (a.id === reminderFor.id ? { ...a, lastReminderSent: result.lastReminderSent } : a)),
      );
      setMetrics((prev) => (prev ? { ...prev, remindersSentThisWeek: prev.remindersSentThisWeek + 1 } : prev));
      showSuccess(result.message || `Reminder sent to ${recipientEmail}`);
      setReminderFor(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to send reminder");
    } finally {
      setSendingReminder(false);
    }
  }

  // ── Automations ─────────────────────────────────────────────
  const activeRules = rules.filter((r) => r.enabled).length;

  function openRuleModal(preset?: RuleDraft) {
    setDraft(preset ? { ...preset } : EMPTY_DRAFT);
    setRuleOpen(true);
  }

  const needsRecipient = draft.ruleType === "internal_follow_up" || draft.triggerType === "weekly_digest";
  const draftDays = draft.triggerType === "weekly_digest" ? null : Math.max(0, Number(draft.days) || 0);
  const draftValid =
    Boolean(draft.name.trim()) &&
    (!needsRecipient || draft.recipient.includes("@")) &&
    (draft.triggerType === "weekly_digest" || (draftDays ?? 0) > 0);

  async function saveRule() {
    if (!draftValid) return;
    setSavingRule(true);
    try {
      const sentence = scheduleSentence(draft.triggerType, draftDays);
      const result = await createAutomationRule({
        name: draft.name.trim(),
        ruleType: draft.ruleType,
        triggerType: draft.triggerType,
        triggerDays: draftDays,
        recipientEmail: draft.recipient.trim() || null,
        triggerCondition: sentence,
        description:
          draft.description.trim() ||
          (draft.ruleType === "customer_payment"
            ? `Email the customer ${sentence.toLowerCase()}.`
            : `Email ${draft.recipient.trim()} ${sentence.toLowerCase()}.`),
      });
      setRules((prev) => [...prev, result.rule]);
      setMetrics((prev) =>
        prev
          ? {
              ...prev,
              activeAutomationRulesCount: prev.activeAutomationRulesCount + (result.rule.enabled ? 1 : 0),
              totalAutomationRulesCount: prev.totalAutomationRulesCount + 1,
            }
          : prev,
      );
      showSuccess(`"${result.rule.title}" is on.`);
      setRuleOpen(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setSavingRule(false);
    }
  }

  async function runRule(rule: AutomationRuleItem) {
    setRunningRuleId(rule.id);
    try {
      const result = await runAutomationRule(rule.id);
      await load();
      showSuccess(
        result.sentCount > 0
          ? `${result.sentCount} email${result.sentCount === 1 ? "" : "s"} sent.`
          : "Nothing to send right now — no invoices match this rule today.",
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to run rule");
    } finally {
      setRunningRuleId(null);
    }
  }

  async function toggleRule(rule: AutomationRuleItem) {
    setTogglingId(rule.id);
    try {
      const result = await toggleAutomationRule(rule.id, !rule.enabled);
      setRules((prev) => prev.map((r) => (r.id === rule.id ? result.rule : r)));
      setMetrics((prev) =>
        prev
          ? {
              ...prev,
              activeAutomationRulesCount: Math.max(0, prev.activeAutomationRulesCount + (result.rule.enabled ? 1 : -1)),
            }
          : prev,
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update rule");
    } finally {
      setTogglingId(null);
    }
  }

  async function confirmDeleteRule() {
    if (!deleteRule) return;
    setDeleting(true);
    try {
      await deleteAutomationRule(deleteRule.id);
      setRules((prev) => prev.filter((r) => r.id !== deleteRule.id));
      setMetrics((prev) =>
        prev
          ? {
              ...prev,
              activeAutomationRulesCount: deleteRule.enabled
                ? Math.max(0, prev.activeAutomationRulesCount - 1)
                : prev.activeAutomationRulesCount,
              totalAutomationRulesCount: Math.max(0, prev.totalAutomationRulesCount - 1),
            }
          : prev,
      );
      showSuccess(`"${deleteRule.title}" deleted.`);
      setDeleteRule(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete rule");
    } finally {
      setDeleting(false);
    }
  }

  // Timeline: place rules relative to the due date (-14 … +30 days)
  const timelineRules = rules.filter((r) => r.triggerType !== "weekly_digest");
  function timelinePos(rule: AutomationRuleItem) {
    const offset = (rule.triggerType === "days_before_due" ? -1 : 1) * (rule.triggerDays ?? 0);
    const clamped = Math.max(-14, Math.min(30, offset));
    return ((clamped + 14) / 44) * 100;
  }

  const overdueAmount = metrics?.totalOverdueAmount ?? 0;

  return (
    <AppPage
      primaryAction={
        tab === 1
          ? { content: "New automation", icon: PlusIcon, onAction: () => openRuleModal() }
          : { content: "View invoices", onAction: () => router.push("/dashboard/invoices") }
      }
      subtitle="See which invoices need chasing, send reminders, and let automations follow up for you."
      title="Payment alerts"
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        {/* Summary */}
        <section className="pa-hero">
          <div className="pa-hero__main">
            <span className="pa-hero__label">Overdue right now</span>
            <span className="pa-hero__value">{loading ? "…" : formatBaseMoney(overdueAmount)}</span>
            <span className="pa-hero__hint">
              {metrics?.totalOverdueCount
                ? `across ${metrics.totalOverdueCount} invoice${metrics.totalOverdueCount === 1 ? "" : "s"}`
                : "Nothing overdue — nice work."}
            </span>
          </div>
          <div className="pa-hero__stats">
            <button
              type="button"
              onClick={() => {
                changeTab(0);
                setFilter("soon");
                setBucket(null);
              }}
            >
              <span>Due this week</span>
              <strong>{formatBaseMoney(metrics?.totalDueSoonAmount ?? 0)}</strong>
              <small>{metrics?.totalDueSoonCount ?? 0} invoices</small>
            </button>
            <div>
              <span>Reminders sent</span>
              <strong>{metrics?.remindersSentThisWeek ?? 0}</strong>
              <small>this week</small>
            </div>
            <button type="button" onClick={() => changeTab(1)}>
              <span>Automations</span>
              <strong>
                {activeRules}
                <em> / {rules.length}</em>
              </strong>
              <small>{activeRules ? "running" : "none running"}</small>
            </button>
          </div>
        </section>

        <div className="pa-tabs">
          <Tabs
            selected={tab}
            tabs={[
              { id: "attention", content: "Needs attention", badge: String(alerts.length) },
              { id: "automations", content: "Automations", badge: String(activeRules) },
            ]}
            onSelect={changeTab}
          />
        </div>

        {loading ? (
          <Card>
            <SkeletonBodyText lines={8} />
          </Card>
        ) : tab === 0 ? (
          <>
            {/* Ageing */}
            <div className="pa-ageing">
              {BUCKETS.map((b) => {
                const total = bucketTotals.get(b.id)!;
                const allAmount = [...bucketTotals.values()].reduce((sum, t) => sum + t.amount, 0);
                const share = allAmount > 0 ? Math.round((total.amount / allAmount) * 100) : 0;
                return (
                  <button
                    className={cn("pa-age", `is-${b.id.replace("+", "plus")}`, bucket === b.id && "is-active", total.count === 0 && "is-zero")}
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setBucket((current) => (current === b.id ? null : b.id));
                      setFilter("all");
                    }}
                  >
                    <span className="pa-age__label">
                      <i />
                      {b.label}
                    </span>
                    <strong>{formatBaseMoney(total.amount)}</strong>
                    <small>
                      {total.count} invoice{total.count === 1 ? "" : "s"}
                      {share ? ` · ${share}%` : ""}
                    </small>
                    <span className="pa-age__bar">
                      <b style={{ width: `${share}%` }} />
                    </span>
                  </button>
                );
              })}
            </div>

            <Card padding="0">
              <div className="pa-toolbar">
                <ButtonGroup variant="segmented">
                  <Button pressed={filter === "all"} onClick={() => { setFilter("all"); setBucket(null); }}>
                    {`All ${alerts.length}`}
                  </Button>
                  <Button pressed={filter === "overdue"} onClick={() => { setFilter("overdue"); setBucket(null); }}>
                    {`Overdue ${overdueCount}`}
                  </Button>
                  <Button pressed={filter === "soon"} onClick={() => { setFilter("soon"); setBucket(null); }}>
                    {`Due soon ${soonCount}`}
                  </Button>
                </ButtonGroup>
                <div className="pa-toolbar__search">
                  <TextField
                    autoComplete="off"
                    clearButton
                    label="Search"
                    labelHidden
                    placeholder="Search invoice or customer"
                    prefix={<Icon source={SearchIcon} />}
                    value={search}
                    onChange={setSearch}
                    onClearButtonClick={() => setSearch("")}
                  />
                </div>
                <Select
                  label="Sort"
                  labelHidden
                  options={[
                    { label: "Most overdue first", value: "oldest" },
                    { label: "Largest amount first", value: "amount" },
                    { label: "Earliest due date", value: "due" },
                  ]}
                  value={sort}
                  onChange={(value) => setSort(value as Sort)}
                />
              </div>

              {visibleAlerts.length === 0 ? (
                <div className="pa-clear">
                  <span className="pa-clear__icon">
                    <Icon source={CheckCircleIcon} />
                  </span>
                  <strong>{alerts.length === 0 ? "All caught up" : "Nothing matches"}</strong>
                  <p>
                    {alerts.length === 0
                      ? "No invoices are overdue or due in the next 7 days. New alerts appear here automatically."
                      : "Try another filter or search."}
                  </p>
                  {alerts.length === 0 && rules.length === 0 ? (
                    <Button onClick={() => changeTab(1)}>Set up automatic reminders</Button>
                  ) : null}
                </div>
              ) : (
                <IndexTable
                  headings={[
                    { title: "Invoice" },
                    { title: "Status" },
                    { title: "Due date" },
                    { title: "Last reminder" },
                    { title: "Outstanding", alignment: "end" },
                    { title: "", hidden: true },
                  ]}
                  itemCount={visibleAlerts.length}
                  resourceName={{ singular: "alert", plural: "alerts" }}
                  selectable={false}
                >
                  {visibleAlerts.map((alert, index) => {
                    const overdue = isOverdue(alert);
                    return (
                      <IndexTable.Row
                        id={alert.id}
                        key={alert.id}
                        position={index}
                        tone={alert.status === "Credit Risk" ? "critical" : undefined}
                        onClick={() => router.push(`/dashboard/invoices/${alert.invoiceId}`)}
                      >
                        <IndexTable.Cell>
                          <div className="pa-inv">
                            <span className={cn("pa-inv__mark", overdue ? "is-late" : "is-soon")} />
                            <span>
                              <strong>{alert.customerName}</strong>
                              <small>
                                {alert.invoiceNumber}
                                {alert.customerEmail ? ` · ${alert.customerEmail}` : " · no email on file"}
                              </small>
                            </span>
                          </div>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          {overdue ? (
                            <Badge tone={alert.status === "Credit Risk" ? "critical" : "warning"}>
                              {alert.status === "Credit Risk"
                                ? `Credit risk · ${alert.daysOverdue}d`
                                : `${alert.daysOverdue} day${alert.daysOverdue === 1 ? "" : "s"} late`}
                            </Badge>
                          ) : (
                            <Badge tone="attention">Due soon</Badge>
                          )}
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Text as="span" variant="bodySm">
                            {formatAlertDate(alert.dueDate)}
                          </Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Text as="span" tone={alert.lastReminderSent ? undefined : "subdued"} variant="bodySm">
                            {formatReminderSent(alert.lastReminderSent)}
                          </Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Text alignment="end" as="span" fontWeight="semibold" numeric>
                            {formatAlertMoney(alert.amountOutstanding, alert.currency)}
                          </Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <div className="pa-actions" onClick={(event) => event.stopPropagation()}>
                            <Button icon={EmailIcon} size="slim" onClick={() => openReminder(alert)}>
                              Remind
                            </Button>
                            <Popover
                              active={openMenu === alert.id}
                              activator={
                                <Button
                                  accessibilityLabel="More actions"
                                  icon={MenuHorizontalIcon}
                                  size="slim"
                                  variant="tertiary"
                                  onClick={() => setOpenMenu((c) => (c === alert.id ? null : alert.id))}
                                />
                              }
                              preferredAlignment="right"
                              onClose={() => setOpenMenu(null)}
                            >
                              <ActionList
                                actionRole="menuitem"
                                onActionAnyItem={() => setOpenMenu(null)}
                                items={[
                                  { content: "Open invoice", onAction: () => router.push(`/dashboard/invoices/${alert.invoiceId}`) },
                                  { content: "Send reminder", onAction: () => openReminder(alert) },
                                ]}
                              />
                            </Popover>
                          </div>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    );
                  })}
                </IndexTable>
              )}
            </Card>
          </>
        ) : (
          <>
            {/* Timeline */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingMd">
                      Your follow-up plan
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      When each automation fires, relative to an invoice&apos;s due date. Checked every 15 minutes.
                    </Text>
                  </BlockStack>
                </InlineStack>
                <div className="pa-line">
                  <div className="pa-line__track">
                    <span className="pa-line__due" style={{ left: `${(14 / 44) * 100}%` }}>
                      <i />
                      <small>Due date</small>
                    </span>
                    {timelineRules.map((rule) => (
                      <span
                        className={cn("pa-line__dot", rule.ruleType === "internal_follow_up" ? "is-team" : "is-customer", !rule.enabled && "is-off")}
                        key={rule.id}
                        style={{ left: `${timelinePos(rule)}%` }}
                        title={`${rule.title} — ${triggerTypeLabel(rule)}`}
                      >
                        <i />
                      </span>
                    ))}
                  </div>
                  <div className="pa-line__scale">
                    <span>2 weeks before</span>
                    <span>1 month after</span>
                  </div>
                  <div className="pa-line__legend">
                    <span className="is-customer">
                      <i /> Emails the customer
                    </span>
                    <span className="is-team">
                      <i /> Emails your team
                    </span>
                    {rules.some((r) => r.triggerType === "weekly_digest") ? (
                      <span>
                        <Icon source={CalendarTimeIcon} /> + Monday summary
                      </span>
                    ) : null}
                  </div>
                </div>
              </BlockStack>
            </Card>

            {rules.length ? (
              <div className="pa-rules">
                {rules.map((rule) => {
                  const team = rule.ruleType === "internal_follow_up";
                  return (
                    <article className={cn("pa-rule", !rule.enabled && "is-off")} key={rule.id}>
                      <span className={cn("pa-rule__icon", team ? "is-team" : "is-customer")}>
                        <Icon source={team ? TeamIcon : PersonIcon} />
                      </span>
                      <div className="pa-rule__body">
                        <div className="pa-rule__title">
                          <strong>{rule.title}</strong>
                          <Badge tone={rule.enabled ? "success" : undefined}>{rule.enabled ? "On" : "Paused"}</Badge>
                        </div>
                        <div className="pa-rule__flow">
                          <span>
                            <Icon source={CalendarTimeIcon} />
                            {triggerTypeLabel(rule)}
                          </span>
                          <b>→</b>
                          <span>
                            <Icon source={EmailIcon} />
                            {team ? rule.recipientEmail || "your team" : "the customer"}
                          </span>
                        </div>
                        {rule.description ? <p>{rule.description}</p> : null}
                        <small>
                          {rule.lastRunAt ? `Last ran ${formatReminderSent(rule.lastRunAt)}` : "Hasn't run yet"}
                        </small>
                      </div>
                      <div className="pa-rule__actions">
                        <Button loading={togglingId === rule.id} onClick={() => void toggleRule(rule)}>
                          {rule.enabled ? "Pause" : "Turn on"}
                        </Button>
                        <Button loading={runningRuleId === rule.id} onClick={() => void runRule(rule)}>
                          Run now
                        </Button>
                        <Button
                          accessibilityLabel={`Delete ${rule.title}`}
                          tone="critical"
                          variant="plain"
                          onClick={() => setDeleteRule(rule)}
                        >
                          Delete
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}

            <section className="pa-starters">
              <header>
                <Text as="h2" variant="headingMd">
                  {rules.length ? "Add another" : "Start with a ready-made automation"}
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  One click to set up — you can adjust the details before saving.
                </Text>
              </header>
              <div className="pa-starters__grid">
                {STARTER_RULES.map((starter) => {
                  const team = starter.ruleType === "internal_follow_up";
                  return (
                    <button className="pa-starter" key={starter.name} type="button" onClick={() => openRuleModal(starter)}>
                      <span className={cn("pa-rule__icon", team ? "is-team" : "is-customer")}>
                        <Icon source={team ? TeamIcon : PersonIcon} />
                      </span>
                      <strong>{starter.name}</strong>
                      <small>{starter.blurb}</small>
                      <span className="pa-starter__when">
                        {scheduleSentence(starter.triggerType, starter.days ? Number(starter.days) : null)}
                      </span>
                    </button>
                  );
                })}
                <button className="pa-starter is-custom" type="button" onClick={() => openRuleModal()}>
                  <span className="pa-starter__plus">
                    <Icon source={PlusIcon} />
                  </span>
                  <strong>Build your own</strong>
                  <small>Choose who gets emailed and when.</small>
                </button>
              </div>
            </section>
          </>
        )}
      </BlockStack>

      {/* Send reminder */}
      <Modal
        open={Boolean(reminderFor)}
        primaryAction={{ content: "Send reminder", loading: sendingReminder, onAction: () => void sendReminder() }}
        secondaryActions={[{ content: "Cancel", disabled: sendingReminder, onAction: () => setReminderFor(null) }]}
        title="Send a payment reminder"
        onClose={() => setReminderFor(null)}
      >
        {reminderFor ? (
          <Modal.Section>
            <BlockStack gap="400">
              <div className="pa-remind-head">
                <div>
                  <strong>{reminderFor.customerName}</strong>
                  <small>
                    {reminderFor.invoiceNumber} · due {formatAlertDate(reminderFor.dueDate)}
                  </small>
                </div>
                <span>{formatAlertMoney(reminderFor.amountOutstanding, reminderFor.currency)}</span>
              </div>
              <TextField
                autoComplete="email"
                helpText={reminderFor.customerEmail ? undefined : "This customer has no email on file — add one to send."}
                label="Send to"
                type="email"
                value={recipientEmail}
                onChange={setRecipientEmail}
              />
              <div className="pa-mail">
                <div className="pa-mail__subject">
                  Payment reminder: invoice {reminderFor.invoiceNumber}
                </div>
                <div className="pa-mail__body">
                  <p>Dear {reminderFor.customerName} accounts team,</p>
                  <p>
                    This is a reminder that invoice <strong>{reminderFor.invoiceNumber}</strong> for{" "}
                    <strong>{formatAlertMoney(reminderFor.amountOutstanding, reminderFor.currency)}</strong> was due on{" "}
                    {formatAlertDate(reminderFor.dueDate)}.
                  </p>
                  {customNote.trim() ? <p className="pa-mail__note">{customNote}</p> : null}
                  <p>
                    Please arrange payment at your earliest convenience, or let us know if it has already been sent.
                  </p>
                  <p>
                    Thank you,
                    <br />
                    Finance &amp; Accounts
                  </p>
                </div>
              </div>
              <TextField
                autoComplete="off"
                label="Add a personal note (optional)"
                multiline={3}
                placeholder="e.g. Our bank details changed this month — please use the account on the invoice."
                value={customNote}
                onChange={setCustomNote}
              />
            </BlockStack>
          </Modal.Section>
        ) : null}
      </Modal>

      {/* New automation */}
      <Modal
        open={ruleOpen}
        primaryAction={{ content: "Turn on automation", loading: savingRule, disabled: !draftValid, onAction: () => void saveRule() }}
        secondaryActions={[{ content: "Cancel", disabled: savingRule, onAction: () => setRuleOpen(false) }]}
        title="New automation"
        onClose={() => setRuleOpen(false)}
      >
        <Modal.Section>
          <BlockStack gap="500">
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                1. Who gets the email?
              </Text>
              <div className="pa-choice">
                {[
                  { value: "customer_payment" as RuleType, title: "The customer", text: "A polite payment reminder", icon: PersonIcon },
                  { value: "internal_follow_up" as RuleType, title: "My team", text: "A nudge to chase the payment", icon: TeamIcon },
                ].map((option) => (
                  <button
                    aria-pressed={draft.ruleType === option.value}
                    className={cn("pa-choice__item", draft.ruleType === option.value && "is-active")}
                    key={option.value}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, ruleType: option.value }))}
                  >
                    <Icon source={option.icon} />
                    <strong>{option.title}</strong>
                    <small>{option.text}</small>
                  </button>
                ))}
              </div>
            </BlockStack>

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                2. When?
              </Text>
              <ButtonGroup variant="segmented" fullWidth>
                <Button pressed={draft.triggerType === "days_before_due"} onClick={() => setDraft((d) => ({ ...d, triggerType: "days_before_due", days: d.days || "3" }))}>
                  Before due date
                </Button>
                <Button pressed={draft.triggerType === "days_after_due"} onClick={() => setDraft((d) => ({ ...d, triggerType: "days_after_due", days: d.days || "3" }))}>
                  After due date
                </Button>
                <Button pressed={draft.triggerType === "weekly_digest"} onClick={() => setDraft((d) => ({ ...d, triggerType: "weekly_digest" }))}>
                  Weekly summary
                </Button>
              </ButtonGroup>
              {draft.triggerType !== "weekly_digest" ? (
                <div className="pa-days">
                  <TextField
                    autoComplete="off"
                    label="Days"
                    labelHidden
                    min={1}
                    suffix="days"
                    type="number"
                    value={draft.days}
                    onChange={(value) => setDraft((d) => ({ ...d, days: value }))}
                  />
                  <Text as="span" tone="subdued">
                    {draft.triggerType === "days_before_due" ? "before the invoice is due" : "after the invoice is due"}
                  </Text>
                </div>
              ) : (
                <Text as="p" tone="subdued" variant="bodySm">
                  Sends a list of every overdue invoice each Monday at 8:00.
                </Text>
              )}
            </BlockStack>

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                3. Details
              </Text>
              <FormLayout>
                {needsRecipient ? (
                  <TextField
                    autoComplete="email"
                    label="Send to"
                    placeholder="finance@yourcompany.com"
                    type="email"
                    value={draft.recipient}
                    onChange={(value) => setDraft((d) => ({ ...d, recipient: value }))}
                  />
                ) : null}
                <TextField
                  autoComplete="off"
                  label="Name"
                  placeholder="e.g. First overdue reminder"
                  value={draft.name}
                  onChange={(value) => setDraft((d) => ({ ...d, name: value }))}
                />
                <TextField
                  autoComplete="off"
                  helpText="Optional — shown on the automation and in team emails."
                  label="Note"
                  multiline={2}
                  value={draft.description}
                  onChange={(value) => setDraft((d) => ({ ...d, description: value }))}
                />
              </FormLayout>
            </BlockStack>

            <div className="pa-summary">
              <Icon source={CalendarTimeIcon} />
              <span>
                {draft.ruleType === "customer_payment" ? "Email the customer" : `Email ${draft.recipient || "your team"}`}{" "}
                {scheduleSentence(draft.triggerType, draftDays).toLowerCase()}.
              </span>
            </div>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Delete automation */}
      <Modal
        open={Boolean(deleteRule)}
        primaryAction={{ content: "Delete automation", destructive: true, loading: deleting, onAction: () => void confirmDeleteRule() }}
        secondaryActions={[{ content: "Cancel", disabled: deleting, onAction: () => setDeleteRule(null) }]}
        title={`Delete "${deleteRule?.title ?? ""}"?`}
        onClose={() => setDeleteRule(null)}
      >
        <Modal.Section>
          <Text as="p">No more emails will be sent by this automation. You can pause it instead if you may need it again.</Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
