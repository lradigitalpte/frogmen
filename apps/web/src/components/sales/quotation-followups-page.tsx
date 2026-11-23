"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  FormLayout,
  Icon,
  InlineStack,
  Modal,
  SkeletonBodyText,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  ClockIcon,
  EmailIcon,
  SendIcon,
  TeamIcon,
} from "@shopify/polaris-icons";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { formatAlertMoney } from "@/lib/alerts-api";
import { formatAppDate } from "@/lib/format-date";
import {
  getQuotationFollowups,
  sendQuotationFollowup,
  updateQuotationFollowupSettings,
  type QuotationFollowupItem,
  type QuotationFollowupSettings,
} from "@/lib/quotation-followups-api";
import { confirmQuotation } from "@/lib/quotations-api";
import { cn } from "@/lib/utils";

const NUDGE_AFTER_DAYS = 3;

function daysUntil(date: string | null) {
  if (!date) return null;
  const target = new Date(`${date.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function relative(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function parseDays(value: string) {
  return value
    .split(/[,;\s]+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
}

/** Sum amounts per currency so mixed-currency totals stay honest. */
function totalsByCurrency(items: QuotationFollowupItem[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.currencyCode, (map.get(item.currencyCode) ?? 0) + (parseFloat(item.amountTotal) || 0));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export function QuotationFollowupsPage() {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<QuotationFollowupItem[]>([]);
  const [settings, setSettings] = useState<QuotationFollowupSettings | null>(null);
  const [draftSettings, setDraftSettings] = useState<QuotationFollowupSettings | null>(null);
  const [days, setDays] = useState("");

  const [selected, setSelected] = useState<QuotationFollowupItem | null>(null);
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getQuotationFollowups();
      setItems(result.quotations);
      setSettings(result.settings);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to load quotation follow-ups");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => void load(), [load]);

  // ── Groups ──────────────────────────────────────────────────
  const awaiting = useMemo(() => items.filter((i) => i.state === "sent"), [items]);
  const nudge = useMemo(
    () => awaiting.filter((i) => i.daysSinceSent >= NUDGE_AFTER_DAYS).sort((a, b) => b.daysSinceSent - a.daysSinceSent),
    [awaiting],
  );
  const recent = useMemo(
    () => awaiting.filter((i) => i.daysSinceSent < NUDGE_AFTER_DAYS).sort((a, b) => b.daysSinceSent - a.daysSinceSent),
    [awaiting],
  );
  const signed = useMemo(() => items.filter((i) => i.state === "signed"), [items]);
  const followupCount = items.reduce((total, item) => total + item.followupCount, 0);
  const awaitingTotals = totalsByCurrency(awaiting);
  const automationOn = Boolean(settings?.customerAutomationEnabled || settings?.internalAutomationEnabled);

  // ── Actions ─────────────────────────────────────────────────
  function openSend(item: QuotationFollowupItem) {
    if (!settings) return;
    const values: Record<string, string> = {
      number: item.number,
      customerName: item.customerName,
      sentDate: item.sentAt ? formatAppDate(item.sentAt.slice(0, 10)) : "",
    };
    const fill = (text: string) =>
      Object.entries(values).reduce((result, [key, replacement]) => result.replaceAll(`{{${key}}}`, replacement), text);
    setSelected(item);
    setRecipient(item.customerEmail ?? "");
    setSubject(fill(settings.customerSubject));
    setMessage(fill(settings.customerMessage));
  }

  async function handleSend() {
    if (!selected) return;
    setSending(true);
    try {
      await sendQuotationFollowup({ quotationId: selected.id, recipientEmail: recipient.trim(), subject, message });
      showSuccess(`Follow-up sent to ${recipient.trim()}.`);
      setSelected(null);
      await load();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to send follow-up");
    } finally {
      setSending(false);
    }
  }

  async function handleConfirm(item: QuotationFollowupItem) {
    setConfirmingId(item.id);
    try {
      await confirmQuotation(item.id);
      showSuccess(`${item.number} confirmed as a sales order.`);
      await load();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to confirm order");
    } finally {
      setConfirmingId(null);
    }
  }

  function openAutomation() {
    if (!settings) return;
    setDraftSettings({ ...settings });
    setDays(settings.customerFollowupDays.join(", "));
    setAutomationOpen(true);
  }

  async function saveSettings() {
    if (!draftSettings) return;
    setSaving(true);
    try {
      const updated = await updateQuotationFollowupSettings({ ...draftSettings, customerFollowupDays: parseDays(days) });
      setSettings(updated);
      setAutomationOpen(false);
      showSuccess("Follow-up automation saved.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to save automation");
    } finally {
      setSaving(false);
    }
  }

  // ── Row ─────────────────────────────────────────────────────
  function renderRow(item: QuotationFollowupItem) {
    const left = daysUntil(item.validityDate);
    const totalWindow = item.daysSinceSent + Math.max(left ?? 0, 0);
    const progress = totalWindow > 0 ? Math.min(100, (item.daysSinceSent / totalWindow) * 100) : 100;
    const isSigned = item.state === "signed";
    const lastFollow = relative(item.lastFollowupAt);

    return (
      <article className={cn("fu-row", isSigned && "is-signed")} key={item.id}>
        <button className="fu-row__main" type="button" onClick={() => router.push(`/dashboard/sales/quotations/${item.id}`)}>
          <span className="fu-row__avatar">{initials(item.customerName)}</span>
          <span className="fu-row__who">
            <strong>{item.customerName}</strong>
            <small>
              {item.number}
              {item.customerEmail ? ` · ${item.customerEmail}` : " · no email on file"}
            </small>
          </span>
          <span className="fu-row__amount">{formatAlertMoney(item.amountTotal, item.currencyCode)}</span>
        </button>

        <div className="fu-row__meta">
          {isSigned ? (
            <span className="fu-chip is-good">
              <Icon source={CheckCircleIcon} />
              Signed — ready to confirm
            </span>
          ) : (
            <>
              <span className={cn("fu-chip", item.daysSinceSent >= NUDGE_AFTER_DAYS && "is-warn")}>
                <Icon source={ClockIcon} />
                {item.daysSinceSent === 0 ? "Sent today" : `Waiting ${item.daysSinceSent} day${item.daysSinceSent === 1 ? "" : "s"}`}
              </span>
              <span className="fu-chip">
                <Icon source={EmailIcon} />
                {item.followupCount
                  ? `${item.followupCount} follow-up${item.followupCount === 1 ? "" : "s"}${lastFollow ? ` · last ${lastFollow}` : ""}`
                  : "No follow-up yet"}
              </span>
              {left !== null ? (
                <span className={cn("fu-validity", left < 0 && "is-expired", left >= 0 && left <= 7 && "is-soon")}>
                  <span className="fu-validity__bar">
                    <b style={{ width: `${progress}%` }} />
                  </span>
                  {left < 0 ? `Expired ${Math.abs(left)}d ago` : left === 0 ? "Expires today" : `${left}d left`}
                </span>
              ) : null}
            </>
          )}
        </div>

        <div className="fu-row__actions">
          {isSigned ? (
            <Button loading={confirmingId === item.id} variant="primary" onClick={() => void handleConfirm(item)}>
              Confirm order
            </Button>
          ) : (
            <Button
              disabled={!item.customerEmail}
              icon={SendIcon}
              variant={item.daysSinceSent >= NUDGE_AFTER_DAYS ? "primary" : "secondary"}
              onClick={() => openSend(item)}
            >
              Follow up
            </Button>
          )}
        </div>
      </article>
    );
  }

  function renderGroup({
    title,
    hint,
    tone,
    list,
    empty,
  }: {
    title: string;
    hint: string;
    tone: "warn" | "wait" | "good";
    list: QuotationFollowupItem[];
    empty: string;
  }) {
    return (
      <section className={cn("fu-group", `is-${tone}`)}>
        <header className="fu-group__head">
          <span className="fu-group__dot" />
          <h2>{title}</h2>
          <span className="fu-group__count">{list.length}</span>
          <small>{hint}</small>
        </header>
        {list.length ? (
          <div className="fu-group__list">
            {list.map((item) => renderRow(item))}
          </div>
        ) : (
          <div className="fu-group__empty">{empty}</div>
        )}
      </section>
    );
  }

  const schedule = settings?.customerFollowupDays?.length ? settings.customerFollowupDays : [];
  const draftDays = parseDays(days);

  return (
    <AppPage
      backAction={{ content: "Quotations", url: "/dashboard/sales/quotations" }}
      primaryAction={{ content: automationOn ? "Edit automation" : "Set up automation", onAction: openAutomation }}
      subtitle="Chase sent quotes before they go cold, and confirm the ones customers have signed."
      title="Quotation follow-ups"
    >
      <BlockStack gap="400">
        {/* Summary */}
        <section className="fu-hero">
          <div className="fu-hero__main">
            <span className="fu-hero__label">Waiting on customers</span>
            <span className="fu-hero__value">
              {loading ? "…" : `${awaiting.length} quote${awaiting.length === 1 ? "" : "s"}`}
            </span>
            <span className="fu-hero__hint">
              {awaitingTotals.length
                ? awaitingTotals.map(([code, amount]) => formatAlertMoney(amount, code)).join(" + ")
                : "Nothing outstanding right now"}
            </span>
          </div>
          <div className="fu-hero__stats">
            <div className={nudge.length ? "is-alert" : undefined}>
              <span>Need a nudge</span>
              <strong>{nudge.length}</strong>
              <small>waiting {NUDGE_AFTER_DAYS}+ days</small>
            </div>
            <div>
              <span>Signed</span>
              <strong>{signed.length}</strong>
              <small>{signed.length ? "ready to confirm" : "none yet"}</small>
            </div>
            <div>
              <span>Follow-ups sent</span>
              <strong>{followupCount}</strong>
              <small>across all quotes</small>
            </div>
          </div>
        </section>

        <div className="fu-layout">
          <div className="fu-main">
            {loading ? (
              <Card>
                <SkeletonBodyText lines={6} />
              </Card>
            ) : items.length === 0 ? (
              <Card>
                <div className="fu-clear">
                  <span className="fu-clear__icon">
                    <Icon source={CheckCircleIcon} />
                  </span>
                  <strong>All caught up</strong>
                  <p>Quotes you send appear here until the customer signs. Nothing is waiting right now.</p>
                  <Button url="/dashboard/sales/quotations">Go to quotations</Button>
                </div>
              </Card>
            ) : (
              <>
                {renderGroup({ empty: "No quote has been waiting long — nice.", hint: `sent ${NUDGE_AFTER_DAYS}+ days ago, still unsigned`, list: nudge, title: "Needs a nudge", tone: "warn" })}
                {renderGroup({ empty: "No quotes sent in the last few days.", hint: "give the customer a little time", list: recent, title: "Recently sent", tone: "wait" })}
                {renderGroup({ empty: "No signed quotes waiting to be confirmed.", hint: "turn them into sales orders", list: signed, title: "Signed — confirm the order", tone: "good" })}
              </>
            )}
          </div>

          {/* Automation */}
          <aside className="fu-side">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Automatic follow-ups
                  </Text>
                  <Badge tone={automationOn ? "success" : undefined}>{automationOn ? "On" : "Off"}</Badge>
                </InlineStack>

                <ol className="fu-plan">
                  <li className="is-sent">
                    <span className="fu-plan__dot">
                      <Icon source={SendIcon} />
                    </span>
                    <div>
                      <strong>Day 0</strong>
                      <small>You send the quotation</small>
                    </div>
                  </li>
                  {settings?.customerAutomationEnabled && schedule.length ? (
                    schedule.map((day) => (
                      <li className="is-customer" key={day}>
                        <span className="fu-plan__dot">
                          <Icon source={EmailIcon} />
                        </span>
                        <div>
                          <strong>Day {day}</strong>
                          <small>Reminder email to the customer</small>
                        </div>
                      </li>
                    ))
                  ) : (
                    <li className="is-off">
                      <span className="fu-plan__dot">
                        <Icon source={EmailIcon} />
                      </span>
                      <div>
                        <strong>Customer reminders off</strong>
                        <small>You follow up by hand</small>
                      </div>
                    </li>
                  )}
                  <li className={settings?.internalAutomationEnabled ? "is-team" : "is-off"}>
                    <span className="fu-plan__dot">
                      <Icon source={TeamIcon} />
                    </span>
                    <div>
                      <strong>
                        {settings?.internalAutomationEnabled
                          ? `Day ${settings.internalReminderAfterDays}+`
                          : "Team reminder off"}
                      </strong>
                      <small>
                        {settings?.internalAutomationEnabled
                          ? "Daily list to your alert recipients"
                          : "No daily list for the sales team"}
                      </small>
                    </div>
                  </li>
                  <li className="is-stop">
                    <span className="fu-plan__dot">
                      <Icon source={CheckCircleIcon} />
                    </span>
                    <div>
                      <strong>Stops automatically</strong>
                      <small>once signed, confirmed or cancelled</small>
                    </div>
                  </li>
                </ol>

                <Button fullWidth onClick={openAutomation}>
                  {automationOn ? "Edit schedule & email" : "Turn on automatic follow-ups"}
                </Button>
              </BlockStack>
            </Card>
          </aside>
        </div>
      </BlockStack>

      {/* Automation settings */}
      <Modal
        open={automationOpen}
        primaryAction={{ content: "Save", loading: saving, onAction: () => void saveSettings() }}
        secondaryActions={[{ content: "Cancel", onAction: () => setAutomationOpen(false) }]}
        title="Automatic follow-ups"
        onClose={() => setAutomationOpen(false)}
      >
        <Modal.Section>
          {draftSettings ? (
            <BlockStack gap="500">
              <div className={cn("fu-opt", draftSettings.customerAutomationEnabled && "is-on")}>
                <Checkbox
                  checked={draftSettings.customerAutomationEnabled}
                  helpText="Polite reminder emails while a quote is unsigned."
                  label="Email the customer automatically"
                  onChange={(customerAutomationEnabled) => setDraftSettings({ ...draftSettings, customerAutomationEnabled })}
                />
                {draftSettings.customerAutomationEnabled ? (
                  <BlockStack gap="200">
                    <TextField
                      autoComplete="off"
                      helpText="Days after sending, separated by commas."
                      label="Send reminders on day"
                      placeholder="3, 7, 14"
                      value={days}
                      onChange={setDays}
                    />
                    {draftDays.length ? (
                      <div className="fu-days">
                        {draftDays.map((d) => (
                          <span key={d}>Day {d}</span>
                        ))}
                      </div>
                    ) : null}
                  </BlockStack>
                ) : null}
              </div>

              <div className={cn("fu-opt", draftSettings.internalAutomationEnabled && "is-on")}>
                <Checkbox
                  checked={draftSettings.internalAutomationEnabled}
                  helpText="A daily list of quotes needing attention, sent to your alert recipients."
                  label="Remind my sales team"
                  onChange={(internalAutomationEnabled) => setDraftSettings({ ...draftSettings, internalAutomationEnabled })}
                />
                {draftSettings.internalAutomationEnabled ? (
                  <TextField
                    autoComplete="off"
                    label="Start after"
                    min={1}
                    suffix="days without a signature"
                    type="number"
                    value={String(draftSettings.internalReminderAfterDays)}
                    onChange={(value) => setDraftSettings({ ...draftSettings, internalReminderAfterDays: Number(value) || 1 })}
                  />
                ) : null}
              </div>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Reminder email
                </Text>
                <TextField
                  autoComplete="off"
                  label="Subject"
                  value={draftSettings.customerSubject}
                  onChange={(customerSubject) => setDraftSettings({ ...draftSettings, customerSubject })}
                />
                <TextField
                  autoComplete="off"
                  helpText="You can use {{customerName}}, {{number}} and {{sentDate}} — they're filled in for each quote."
                  label="Message"
                  multiline={6}
                  value={draftSettings.customerMessage}
                  onChange={(customerMessage) => setDraftSettings({ ...draftSettings, customerMessage })}
                />
              </BlockStack>
            </BlockStack>
          ) : null}
        </Modal.Section>
      </Modal>

      {/* Manual follow-up */}
      <Modal
        open={Boolean(selected)}
        primaryAction={{
          content: "Send follow-up",
          loading: sending,
          disabled: !recipient.includes("@") || !subject.trim() || !message.trim(),
          onAction: () => void handleSend(),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setSelected(null) }]}
        title="Send a follow-up"
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <Modal.Section>
            <BlockStack gap="400">
              <div className="fu-send-head">
                <div>
                  <strong>{selected.customerName}</strong>
                  <small>
                    {selected.number} · sent {selected.daysSinceSent === 0 ? "today" : `${selected.daysSinceSent} days ago`}
                    {selected.followupCount ? ` · ${selected.followupCount} follow-up${selected.followupCount === 1 ? "" : "s"} so far` : ""}
                  </small>
                </div>
                <span>{formatAlertMoney(selected.amountTotal, selected.currencyCode)}</span>
              </div>
              <FormLayout>
                <TextField autoComplete="email" label="To" type="email" value={recipient} onChange={setRecipient} />
                <TextField autoComplete="off" label="Subject" value={subject} onChange={setSubject} />
                <TextField autoComplete="off" label="Message" multiline={8} value={message} onChange={setMessage} />
              </FormLayout>
              {!settings?.customerAutomationEnabled ? (
                <Banner tone="info">
                  Tip: turn on automatic follow-ups and these reminders go out on their own.
                </Banner>
              ) : null}
            </BlockStack>
          </Modal.Section>
        ) : null}
      </Modal>
    </AppPage>
  );
}
