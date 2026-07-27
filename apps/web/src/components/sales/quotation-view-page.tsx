"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  EmptyState,
  Grid,
  InlineStack,
  Modal,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { formatMoney } from "@/components/sales/format-money";
import { getCustomer } from "@/lib/customers-api";
import { listCurrencies } from "@/lib/currencies-api";
import type { Currency } from "@/lib/currencies-api";
import {
  cancelQuotation,
  confirmQuotation,
  deleteQuotation,
  getQuotation,
  markQuotationSent,
  sendQuotationEmail,
  type Quotation,
  type QuotationActivity,
} from "@/lib/quotations-api";
import { QuotationWorkflowPanel } from "@/components/sales/quotation-workflow-panel";
import { useToast } from "@/components/providers/toast-provider";

interface QuotationViewPageProps {
  quotationId: string;
}

function documentLabel(state: Quotation["state"]) {
  return state === "confirmed" ? "Sales Order" : "Quotation";
}

function stateBadgeLabel(state: Quotation["state"]) {
  switch (state) {
    case "draft":
      return "Draft Quotation";
    case "sent":
      return "Quotation Sent to Customer";
    case "confirmed":
      return "Confirmed Sales Order";
    case "cancelled":
      return "Cancelled";
  }
}

export function QuotationViewPage({ quotationId }: QuotationViewPageProps) {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const searchParams = useSearchParams();
  const createdDraft = searchParams.get("created") === "draft";
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Tab State for Order Workspace
  const [selectedTab, setSelectedTab] = useState(0);

  // PDF Fullscreen Preview Modal State
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  // Email Send Modal State
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSuccessBanner, setEmailSuccessBanner] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Activity Log Email View Modal State
  const [selectedActivity, setSelectedActivity] = useState<QuotationActivity | null>(null);

  const orderWorkspaceTabs = [
    { id: "lines", content: "Order Lines" },
    { id: "other", content: "Other Information" },
    { id: "terms", content: "Terms & Conditions" },
  ];

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const quotationResult = await getQuotation(quotationId);
        const [currencies, customer] = await Promise.all([
          listCurrencies(),
          getCustomer(quotationResult.customerId).catch(() => null),
        ]);

        const resolvedCurrency =
          currencies.find((item) => item.id === quotationResult.currencyId) ?? null;
        const customerEmail = customer?.email ?? quotationResult.customerEmail ?? "";
        const customerName = customer?.name ?? quotationResult.customerName ?? "Customer";
        const totalLabel = formatMoney(
          quotationResult.amountTotal,
          resolvedCurrency?.code,
          resolvedCurrency?.decimalPlaces,
        );

        setQuotation(quotationResult);
        setCurrency(resolvedCurrency);
        setEmailRecipient(customerEmail);
        setEmailSubject(`Quotation ${quotationResult.number}`);
        setEmailBody(
          `Dear ${customerName},\n\nPlease find attached quotation ${quotationResult.number} for your review.\n\nTotal Amount: ${totalLabel}\n\nBest regards,\nFrogmen Sales Operations`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load quotation");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [quotationId]);

  const lines = quotation?.lines ?? [];
  const currencyCode = currency?.code ?? "USD";
  const decimalPlaces = currency?.decimalPlaces ?? 2;

  const amountUntaxed = quotation?.amountUntaxed ?? "0";
  const amountTax = quotation?.amountTax ?? "0";
  const amountTotal = quotation?.amountTotal ?? "0";

  async function handleMarkSent() {
    if (!quotation) return;
    setActionLoading(true);
    try {
      const updated = await markQuotationSent(quotation.id);
      setQuotation(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark quotation as sent");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConfirm() {
    if (!quotation) return;
    setActionLoading(true);
    try {
      const updated = await confirmQuotation(quotation.id);
      setQuotation(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm sales order");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel() {
    if (!quotation) return;
    setActionLoading(true);
    try {
      const updated = await cancelQuotation(quotation.id);
      setQuotation(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel quotation");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!quotation) return;
    setActionLoading(true);
    try {
      await deleteQuotation(quotation.id);
      showSuccess(`Cancelled quotation ${quotation.number} deleted.`);
      router.push("/dashboard/sales/quotations");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete quotation";
      setError(message);
      showError(message);
      setActionLoading(false);
    }
  }

  async function handleSendEmail() {
    if (!quotation) return;
    setEmailSending(true);
    try {
      await sendQuotationEmail(quotation.id, emailRecipient, emailSubject, emailBody);
      setEmailSuccessBanner(`Sales Quotation PDF email successfully sent to ${emailRecipient}. Status updated to Quotation Sent.`);
      setEmailModalOpen(false);
      const updated = await getQuotation(quotation.id);
      setQuotation(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setEmailSending(false);
    }
  }

  function handleCreateInvoice() {
    router.push(`/dashboard/invoices/new?quotationId=${quotation?.id}`);
  }

  if (loading) {
    return (
      <AppPage title="Sales Order Workspace">
        <Text as="p">Loading sales order workspace...</Text>
      </AppPage>
    );
  }

  if (!quotation) {
    return (
      <AppPage title="Sales Order Workspace">
        <Banner tone="critical">{error || "Quotation not found"}</Banner>
      </AppPage>
    );
  }

  const isConfirmed = quotation.state === "confirmed";
  const isSent = quotation.state === "sent";
  const isCancelled = quotation.state === "cancelled";
  const isDraft = quotation.state === "draft";
  const docLabel = documentLabel(quotation.state);

  const primaryAction = isCancelled
    ? undefined
    : isConfirmed
      ? {
          content: "Create Invoice",
          onAction: handleCreateInvoice,
        }
      : isSent
        ? {
            content: "Confirm Sales Order",
            loading: actionLoading,
            onAction: handleConfirm,
          }
        : {
            content: "Send to Customer",
            onAction: () => setEmailModalOpen(true),
          };

  return (
    <AppPage
      backAction={{ content: "Quotations", url: "/dashboard/sales/quotations" }}
      primaryAction={primaryAction}
      secondaryActions={[
        ...(quotation.state === "draft" || quotation.state === "sent"
          ? [
              {
                content: "Edit",
                onAction: () =>
                  router.push(`/dashboard/sales/quotations/${quotation.id}/edit`),
              },
            ]
          : []),
        {
          content: "Send by Email",
          onAction: () => setEmailModalOpen(true),
        },
        {
          content: "Preview PDF",
          onAction: () => setPdfModalOpen(true),
        },
        ...(quotation.state !== "cancelled"
          ? [
              {
                content: "Cancel Order",
                onAction: handleCancel,
              },
            ]
          : []),
        ...(quotation.state === "cancelled"
          ? [
              {
                content: "Delete",
                destructive: true,
                onAction: () => setDeleteModalOpen(true),
              },
            ]
          : []),
      ]}
      subtitle={`Customer: ${quotation.customerName ?? " "} • Date: ${quotation.quoteDate}`}
      title={`${docLabel} ${quotation.number}`}
    >
      <BlockStack gap="500">
        {createdDraft ? (
          <Banner tone="success" onDismiss={() => router.replace(`/dashboard/sales/quotations/${quotation.id}`)}>
            Draft quotation saved. Send or preview it for the customer, then confirm
            when approved. Invoices can only be created after confirmation.
          </Banner>
        ) : null}

        {isDraft ? (
          <Banner tone="info">
            <p>
              Step 1 of 4: this is a <strong>draft</strong>. Use{" "}
              <strong>Send to customer</strong> or <strong>Mark as sent</strong>, then{" "}
              <strong>Confirm sales order</strong> when approved. Invoicing unlocks after
              confirmation.
            </p>
          </Banner>
        ) : null}

        {isSent ? (
          <Banner tone="info">
            <p>
              Step 2 of 4: quotation sent. Click <strong>Confirm sales order</strong> when
              the customer accepts   that unlocks <strong>Create invoice</strong>.
            </p>
          </Banner>
        ) : null}

        {isConfirmed && quotation.invoiceStatus !== "invoiced" ? (
          <Banner tone="success">
            <p>
              Step 3 of 4: sales order confirmed. Click <strong>Create invoice</strong> to
              bill the customer.
            </p>
          </Banner>
        ) : null}

        {emailSuccessBanner ? (
          <Banner tone="success" onDismiss={() => setEmailSuccessBanner(null)}>
            {emailSuccessBanner}
          </Banner>
        ) : null}

        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <Card>
          <QuotationWorkflowPanel
            quotation={quotation}
            actionLoading={actionLoading}
            onConfirm={() => void handleConfirm()}
            onCreateInvoice={handleCreateInvoice}
            onMarkSent={() => void handleMarkSent()}
            onSendEmail={() => setEmailModalOpen(true)}
          />
        </Card>

        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="200" blockAlign="center">
              {(quotation.state === "draft" || quotation.state === "sent") && (
                <Button
                  onClick={() =>
                    router.push(`/dashboard/sales/quotations/${quotation.id}/edit`)
                  }
                >
                  Edit lines
                </Button>
              )}

              <Button onClick={() => setEmailModalOpen(true)}>Send by email</Button>

              <Button onClick={() => setPdfModalOpen(true)}>Preview PDF</Button>
            </InlineStack>
          </InlineStack>
        </Card>

        {/* ── Sales Order Header Card ── */}
        <Card>
          <BlockStack gap="500">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <Text as="h1" variant="headingLg">
                  {docLabel} #{quotation.number}
                </Text>
                <Text as="p" tone="subdued">
                  {quotation.internalReference || quotation.customerReference || "Commercial quotation"}
                </Text>
              </BlockStack>
              <Badge tone={isConfirmed ? "success" : isSent ? "info" : isCancelled ? "critical" : undefined}>
                {stateBadgeLabel(quotation.state)}
              </Badge>
            </InlineStack>

            <Divider />

            {/* General Information Grid */}
            <Grid>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
                <BlockStack gap="050">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Customer Account
                  </Text>
                  <Text as="span" fontWeight="bold">
                    {quotation.customerName ?? " "}
                  </Text>
                </BlockStack>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
                <BlockStack gap="050">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Quotation Date
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {quotation.quoteDate}
                  </Text>
                </BlockStack>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
                <BlockStack gap="050">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Expiration Date
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {quotation.validityDate ?? " "}
                  </Text>
                </BlockStack>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
                <BlockStack gap="050">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Payment Terms
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {quotation.paymentReference || " "}
                  </Text>
                </BlockStack>
              </Grid.Cell>
            </Grid>

            {/* 3-Tab Order Workspace: Order Lines / Other Info / Terms & Conditions */}
            <Tabs
              tabs={orderWorkspaceTabs}
              selected={selectedTab}
              onSelect={setSelectedTab}
            />

            {/* TAB 0: ORDER LINES TABLE & PROFIT MARGIN BOX */}
            {selectedTab === 0 ? (
              <BlockStack gap="400">
                {lines.length === 0 ? (
                  <EmptyState
                    heading="No products on this quotation"
                    image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
                  >
                    <p>Add line items from the edit screen to build this quotation.</p>
                  </EmptyState>
                ) : (
                  <div className="frogmen-recent-table-wrapper">
                    <table className="frogmen-recent-table">
                      <thead>
                        <tr>
                          <th style={{ width: "34%" }}>Description</th>
                          <th style={{ width: "10%" }}>Quantity</th>
                          <th style={{ width: "14%", textAlign: "right" }}>Unit Price</th>
                          <th style={{ width: "10%", textAlign: "right" }}>Disc. %</th>
                          <th style={{ width: "10%", textAlign: "right" }}>Tax %</th>
                          <th style={{ width: "16%", textAlign: "right" }}>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => (
                          <tr key={line.id}>
                            <td>
                              <BlockStack gap="050">
                                <Text as="span" fontWeight="bold">
                                  {line.description}
                                </Text>
                                {line.serialNumber ? (
                                  <Text as="span" tone="subdued" variant="bodySm">
                                    SN: {line.serialNumber}
                                  </Text>
                                ) : line.productUnitId ? (
                                  <Text as="span" tone="subdued" variant="bodySm">
                                    Serial-tracked item
                                  </Text>
                                ) : null}
                              </BlockStack>
                            </td>
                            <td>{line.quantity}</td>
                            <td style={{ textAlign: "right" }}>
                              {formatMoney(line.unitPrice, currencyCode, decimalPlaces)}
                            </td>
                            <td style={{ textAlign: "right" }}>{line.discountPercent}%</td>
                            <td style={{ textAlign: "right" }}>{line.taxRatePercent}%</td>
                            <td style={{ textAlign: "right" }} className="frogmen-font-bold">
                              {formatMoney(line.priceSubtotal, currencyCode, decimalPlaces)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <Divider />

                <InlineStack align="end">
                  <div style={{ width: "360px" }}>
                    <div className="quotation-summary-panel__rows">
                      <div className="quotation-summary-row">
                        <Text as="span" tone="subdued">
                          Untaxed Amount
                        </Text>
                        <Text as="span" fontWeight="semibold">
                          {formatMoney(amountUntaxed, currencyCode, decimalPlaces)}
                        </Text>
                      </div>
                      <div className="quotation-summary-row">
                        <Text as="span" tone="subdued">
                          Tax
                        </Text>
                        <Text as="span" fontWeight="semibold">
                          +{formatMoney(amountTax, currencyCode, decimalPlaces)}
                        </Text>
                      </div>
                      <div className="quotation-summary-row">
                        <Text as="span" variant="headingMd" fontWeight="bold">
                          Total
                        </Text>
                        <Text as="span" variant="headingLg" fontWeight="bold">
                          {formatMoney(amountTotal, currencyCode, decimalPlaces)}
                        </Text>
                      </div>
                    </div>
                  </div>
                </InlineStack>
              </BlockStack>
            ) : null}

            {/* TAB 1: OTHER INFORMATION */}
            {selectedTab === 1 ? (
              <Grid>
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      References
                    </Text>
                    <Text as="p">
                      <Text as="span" tone="subdued">Customer reference: </Text>
                      {quotation.customerReference || " "}
                    </Text>
                    <Text as="p">
                      <Text as="span" tone="subdued">Internal reference: </Text>
                      {quotation.internalReference || " "}
                    </Text>
                    <Text as="p">
                      <Text as="span" tone="subdued">Payment reference: </Text>
                      {quotation.paymentReference || " "}
                    </Text>
                  </BlockStack>
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Billing
                    </Text>
                    <Text as="p">
                      <Text as="span" tone="subdued">Currency: </Text>
                      {currency ? `${currency.code}   ${currency.name}` : " "}
                    </Text>
                    <Text as="p">
                      <Text as="span" tone="subdued">Invoice status: </Text>
                      {quotation.invoiceStatus === "to_invoice"
                        ? "Ready to invoice"
                        : quotation.invoiceStatus === "invoiced"
                          ? "Invoiced"
                          : "Not invoiced"}
                    </Text>
                  </BlockStack>
                </Grid.Cell>
              </Grid>
            ) : null}

            {selectedTab === 2 ? (
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">Notes & Terms</Text>
                <Text as="p" tone="subdued">
                  {quotation.notes?.trim() || "No terms or notes added for this quotation."}
                </Text>
              </BlockStack>
            ) : null}
          </BlockStack>
        </Card>

        {/* ── User Activity Audit Log & Email History ── */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <Text as="h2" variant="headingMd">
                  User Activity Audit Log & History
                </Text>
                <Text as="p" tone="subdued">
                  Audit trail tracking user actions for sales order #{quotation.number}
                </Text>
              </BlockStack>
              <Badge tone="info">Click Log Item for Full Details</Badge>
            </InlineStack>

            <div className="frogmen-rules-list">
              {quotation.activities && quotation.activities.length > 0 ? (
                quotation.activities.map((act) => (
                  <div
                    key={act.id}
                    className="frogmen-rule-item"
                    style={{ cursor: "pointer", transition: "background 0.15s ease" }}
                    onClick={() => setSelectedActivity(act)}
                  >
                    <div className="frogmen-rule-info">
                      <div className="frogmen-rule-title-row">
                        <span className="frogmen-rule-title">{act.message}</span>
                        <Badge tone={act.activityType === "confirmed" ? "success" : "info"}>
                          {act.activityType}
                        </Badge>
                      </div>
                      <span className="frogmen-rule-desc">
                        {new Date(act.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <Button size="slim" onClick={() => setSelectedActivity(act)}>
                      View
                    </Button>
                  </div>
                ))
              ) : (
                <EmptyState
                  heading="No activity yet"
                  image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
                >
                  <p>Actions like create, update, and confirm will appear here.</p>
                </EmptyState>
              )}
            </div>
          </BlockStack>
        </Card>
      </BlockStack>

      <DocumentPreviewModal
        onClose={() => setPdfModalOpen(false)}
        open={pdfModalOpen}
        quotationId={quotation.id}
        quotationNumber={quotation.number}
        title="Quotation PDF preview"
      />

      {/* ── Send Customer Email Modal ── */}
      <Modal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        title={`Send Sales Quotation ${quotation.number} to Customer`}
        primaryAction={{
          content: "Dispatch Quotation Email",
          loading: emailSending,
          onAction: () => void handleSendEmail(),
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setEmailModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              Attached File: Sales_Quotation_{quotation.number}.pdf (142 KB PDF Document)
            </Banner>

            <TextField
              autoComplete="email"
              label="Recipient Customer Email"
              value={emailRecipient}
              onChange={setEmailRecipient}
            />
            <TextField
              autoComplete="off"
              label="Email Subject"
              value={emailSubject}
              onChange={setEmailSubject}
            />
            <TextField
              autoComplete="off"
              label="Email Body Preview"
              multiline={6}
              value={emailBody}
              onChange={setEmailBody}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── Interactive Email Log Detail Modal ── */}
      <Modal
        open={selectedActivity !== null}
        onClose={() => setSelectedActivity(null)}
        title="Audit Activity Log & Dispatched Email Detail"
        primaryAction={{
          content: "Close Preview",
          onAction: () => setSelectedActivity(null),
        }}
      >
        <Modal.Section>
          {selectedActivity ? (
            <BlockStack gap="400">
              <Banner tone="info">
                {new Date(selectedActivity.createdAt).toLocaleString()}
              </Banner>

              <div className="frogmen-email-preview-box">
                <div className="frogmen-email-field">
                  <Text as="span" fontWeight="bold">Event: </Text>
                  {selectedActivity.message}
                </div>
                <div className="frogmen-email-field">
                  <Text as="span" fontWeight="bold">Type: </Text>
                  {selectedActivity.activityType}
                </div>
              </div>
            </BlockStack>
          ) : null}
        </Modal.Section>
      </Modal>

      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={`Delete cancelled quotation ${quotation.number}?`}
        primaryAction={{
          content: "Delete",
          destructive: true,
          loading: actionLoading,
          onAction: () => void handleDelete(),
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setDeleteModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            This removes {quotation.number} from normal lists. Its audit history
            and document number remain recorded. Only cancelled quotations can
            be deleted.
          </Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
