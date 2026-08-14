"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  EmptyState,
  FormLayout,
  InlineGrid,
  IndexTable,
  InlineStack,
  Modal,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage, IndexSurface } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import {
  getQuotationFollowups,
  sendQuotationFollowup,
  updateQuotationFollowupSettings,
  type QuotationFollowupItem,
  type QuotationFollowupSettings,
} from "@/lib/quotation-followups-api";

export default function QuotationFollowupsPage() {
  const { showError, showSuccess } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<QuotationFollowupItem[]>([]);
  const [settings, setSettings] = useState<QuotationFollowupSettings | null>(null);
  const [selected, setSelected] = useState<QuotationFollowupItem | null>(null);
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState("");
  const [automationOpen, setAutomationOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getQuotationFollowups();
      setItems(result.quotations);
      setSettings(result.settings);
      setDays(result.settings.customerFollowupDays.join(", "));
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to load quotation follow-ups");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => void load(), [load]);

  const unsignedCount = useMemo(
    () => items.filter((item) => item.state === "sent").length,
    [items],
  );

  function openSend(item: QuotationFollowupItem) {
    if (!settings) return;
    const values = {
      number: item.number,
      customerName: item.customerName,
      sentDate: item.sentAt?.slice(0, 10) ?? "",
    };
    const fill = (value: string) =>
      Object.entries(values).reduce(
        (result, [key, replacement]) => result.replaceAll(`{{${key}}}`, replacement),
        value,
      );
    setSelected(item);
    setRecipient(item.customerEmail ?? "");
    setSubject(fill(settings.customerSubject));
    setMessage(fill(settings.customerMessage));
  }

  async function handleSend() {
    if (!selected) return;
    setSending(true);
    try {
      await sendQuotationFollowup({
        quotationId: selected.id,
        recipientEmail: recipient,
        subject,
        message,
      });
      showSuccess(`Follow-up sent for quotation ${selected.number}.`);
      setSelected(null);
      await load();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to send follow-up");
    } finally {
      setSending(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    const parsedDays = days
      .split(/[,;\s]+/)
      .map(Number)
      .filter((value) => Number.isInteger(value) && value > 0);
    setSaving(true);
    try {
      const updated = await updateQuotationFollowupSettings({
        ...settings,
        customerFollowupDays: parsedDays,
      });
      setSettings(updated);
      setDays(updated.customerFollowupDays.join(", "));
      setAutomationOpen(false);
      showSuccess("Quotation follow-up automation saved.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to save automation");
    } finally {
      setSaving(false);
    }
  }

  const followupCount = items.reduce((total, item) => total + item.followupCount, 0);
  const signedCount = items.filter((item) => item.state === "signed").length;
  const attentionCount = items.filter(
    (item) => item.state === "sent" && item.daysSinceSent >= 3,
  ).length;
  const automationEnabled = Boolean(
    settings?.customerAutomationEnabled || settings?.internalAutomationEnabled,
  );

  return (
    <AppPage
      backAction={{ content: "Quotations", url: "/dashboard/sales/quotations" }}
      title="Quotation Follow-ups"
      subtitle="Keep sent quotations moving without losing track of customer responses."
      primaryAction={{ content: "Configure automation", onAction: () => setAutomationOpen(true) }}
    >
      <BlockStack gap="500">
        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
          {([
            ["Awaiting signature", unsignedCount, "attention" as const],
            ["Needs attention", attentionCount, attentionCount ? "critical" as const : "success" as const],
            ["Signed", signedCount, "success" as const],
            ["Follow-ups sent", followupCount, "info" as const],
          ] as const).map(([label, value, tone]) => (
            <Card key={label}>
              <BlockStack gap="150">
                <Text as="span" tone="subdued" variant="bodySm">{label}</Text>
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="strong" variant="headingLg">{value}</Text>
                  <Badge tone={tone}>{label === "Needs attention" && value ? "Review" : "Current"}</Badge>
                </InlineStack>
              </BlockStack>
            </Card>
          ))}
        </InlineGrid>

        <Card>
          <InlineStack align="space-between" blockAlign="center" gap="300">
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingSm">Automation</Text>
                <Badge tone={automationEnabled ? "success" : undefined}>{automationEnabled ? "Active" : "Off"}</Badge>
              </InlineStack>
              <Text as="p" tone="subdued" variant="bodySm">
                {automationEnabled
                  ? `Customer reminders: ${settings?.customerAutomationEnabled ? `days ${days}` : "off"} · Team digest: ${settings?.internalAutomationEnabled ? "on" : "off"}`
                  : "Manual follow-up is available. Turn on automation when your email schedule is ready."}
              </Text>
            </BlockStack>
            <Button onClick={() => setAutomationOpen(true)}>Manage</Button>
          </InlineStack>
        </Card>

        <IndexSurface>
          <IndexTable
            emptyState={
              <EmptyState
                heading="No quotations need follow-up"
                image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
                action={{ content: "View quotations", url: "/dashboard/sales/quotations" }}
              >
                <p>Sent quotations awaiting a signature will appear here automatically.</p>
              </EmptyState>
            }
            resourceName={{ singular: "quotation", plural: "quotations" }}
            itemCount={items.length}
            loading={loading}
            selectable={false}
            headings={[
              { title: "Quotation" }, { title: "Customer" }, { title: "Waiting" },
              { title: "Follow-ups" }, { title: "Status" }, { title: "Action" },
            ]}
          >
            {items.map((item, index) => (
              <IndexTable.Row id={item.id} key={item.id} position={index}>
                <IndexTable.Cell><Text as="span" fontWeight="semibold">{item.number}</Text></IndexTable.Cell>
                <IndexTable.Cell><BlockStack gap="050"><Text as="span">{item.customerName}</Text><Text as="span" tone="subdued" variant="bodySm">{item.customerEmail ?? "No customer email"}</Text></BlockStack></IndexTable.Cell>
                <IndexTable.Cell>{item.daysSinceSent} days</IndexTable.Cell>
                <IndexTable.Cell>{item.followupCount}{item.lastFollowupAt ? ` · ${new Date(item.lastFollowupAt).toLocaleDateString()}` : ""}</IndexTable.Cell>
                <IndexTable.Cell><Badge tone={item.state === "signed" ? "success" : "attention"}>{item.state === "signed" ? "Signed" : "Awaiting signature"}</Badge></IndexTable.Cell>
                <IndexTable.Cell><InlineStack gap="200"><Button url={`/dashboard/sales/quotations/${item.id}`}>View</Button>{item.state === "sent" ? <Button variant="primary" disabled={!item.customerEmail} onClick={() => openSend(item)}>Send follow-up</Button> : null}</InlineStack></IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        </IndexSurface>
      </BlockStack>

      <Modal
        open={automationOpen}
        onClose={() => setAutomationOpen(false)}
        title="Quotation follow-up automation"
        primaryAction={{ content: "Save automation", loading: saving, onAction: () => void saveSettings() }}
        secondaryActions={[{ content: "Cancel", onAction: () => setAutomationOpen(false) }]}
      >
        <Modal.Section>
          {settings ? (
            <BlockStack gap="500">
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">Customer reminders</Text>
                <Checkbox label="Automatically email customers while a quotation is unsigned" checked={settings.customerAutomationEnabled} onChange={(customerAutomationEnabled) => setSettings({ ...settings, customerAutomationEnabled })} />
                <TextField autoComplete="off" disabled={!settings.customerAutomationEnabled} label="Reminder days" helpText="Comma-separated days after sending, for example 3, 7." value={days} onChange={setDays} />
              </BlockStack>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">Internal sales reminder</Text>
                <Checkbox label="Email our Alert recipients a daily list needing attention" checked={settings.internalAutomationEnabled} onChange={(internalAutomationEnabled) => setSettings({ ...settings, internalAutomationEnabled })} />
                <TextField autoComplete="off" disabled={!settings.internalAutomationEnabled} type="number" label="Start reminding the team after" suffix="days" value={String(settings.internalReminderAfterDays)} onChange={(value) => setSettings({ ...settings, internalReminderAfterDays: Number(value) || 1 })} />
              </BlockStack>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">Customer email template</Text>
                <TextField autoComplete="off" label="Subject" value={settings.customerSubject} onChange={(customerSubject) => setSettings({ ...settings, customerSubject })} />
                <TextField autoComplete="off" multiline={6} label="Message" helpText="Available: {{number}}, {{customerName}}, {{sentDate}}" value={settings.customerMessage} onChange={(customerMessage) => setSettings({ ...settings, customerMessage })} />
              </BlockStack>
              <Banner tone="info">Automation stops as soon as a quotation is signed, confirmed, or cancelled.</Banner>
            </BlockStack>
          ) : null}
        </Modal.Section>
      </Modal>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={`Follow up ${selected?.number ?? "quotation"}`}
        primaryAction={{ content: "Send email", loading: sending, disabled: !recipient.trim() || !subject.trim() || !message.trim(), onAction: () => void handleSend() }}
        secondaryActions={[{ content: "Cancel", onAction: () => setSelected(null) }]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField autoComplete="email" label="Customer email" value={recipient} onChange={setRecipient} />
            <TextField autoComplete="off" label="Subject" value={subject} onChange={setSubject} />
            <TextField autoComplete="off" multiline={8} label="Message" value={message} onChange={setMessage} />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
