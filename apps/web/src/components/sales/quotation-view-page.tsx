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
  Link,
  Modal,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import { useRouter, useSearchParams } from "next/navigation";
import { groupSerializedLines } from "@frog1/shared";
import { useEffect, useMemo, useState } from "react";
import { SendDocumentEmailModal } from "@/components/documents/send-document-email-modal";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { AppPage } from "@/components/layout/page";
import { formatMoney } from "@/components/sales/format-money";
import { LineItemDescription } from "@/components/sales/line-item-description";
import { formatQuantity } from "@/lib/format-quantity";
import { formatDiscountLabel, resolveDeliveryFee } from "@/lib/line-item-utils";
import { listCurrencies } from "@/lib/currencies-api";
import type { Currency } from "@/lib/currencies-api";
import {
  cancelQuotation,
  confirmQuotation,
  deleteQuotation,
  getQuotation,
  getQuotationSigningUrl,
  markQuotationSent,
  sendQuotationEmail,
  updateQuotationInternalNotes,
  uploadCustomerPoDocument,
  type Quotation,
  type QuotationActivity,
} from "@/lib/quotations-api";
import { QuotationWorkflowPanel } from "@/components/sales/quotation-workflow-panel";
import { QuotationCustomerApprovalCard } from "@/components/sales/quotation-customer-approval-card";
import { DealThreadPanel } from "@/components/sales/deal-thread-panel";
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
    case "signed":
      return "Digitally Signed";
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
  const [copySigningLinkLoading, setCopySigningLinkLoading] = useState(false);

  // Tab State for Order Workspace
  const [selectedTab, setSelectedTab] = useState(0);

  // PDF Fullscreen Preview Modal State
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  // Email Send Modal State
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSuccessBanner, setEmailSuccessBanner] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Activity Log Email View Modal State
  const [selectedActivity, setSelectedActivity] = useState<QuotationActivity | null>(null);

  // Internal Notes State
  const [internalNotesModalOpen, setInternalNotesModalOpen] = useState(false);
  const [editingInternalNotes, setEditingInternalNotes] = useState("");
  const [savingInternalNotes, setSavingInternalNotes] = useState(false);
  const [poUploading, setPoUploading] = useState(false);

  async function handlePoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !quotation) return;
    setPoUploading(true);
    try {
      const updated = await uploadCustomerPoDocument(quotation.id, file);
      setQuotation(updated);
      showSuccess(`Uploaded Customer PO document: ${file.name}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to upload PO document");
    } finally {
      setPoUploading(false);
    }
  }

  async function handleCopySigningLink() {
    if (!quotation) return;
    setCopySigningLinkLoading(true);
    try {
      const { url } = await getQuotationSigningUrl(quotation.id);
      await navigator.clipboard.writeText(url);
      showSuccess("Customer signing link copied to clipboard");
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to copy signing link",
      );
    } finally {
      setCopySigningLinkLoading(false);
    }
  }

  async function handleSaveInternalNotes() {
    if (!quotation) return;
    setSavingInternalNotes(true);
    try {
      const updated = await updateQuotationInternalNotes(quotation.id, editingInternalNotes);
      setQuotation(updated);
      setInternalNotesModalOpen(false);
      showSuccess("Internal team notes saved");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save internal notes");
    } finally {
      setSavingInternalNotes(false);
    }
  }

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
        const [currencies] = await Promise.all([
          listCurrencies(),
        ]);

        const resolvedCurrency =
          currencies.find((item) => item.id === quotationResult.currencyId) ?? null;

        setQuotation(quotationResult);
        setCurrency(resolvedCurrency);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load quotation");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [quotationId]);

  const lines = quotation?.lines ?? [];
  const displayLines = useMemo(() => groupSerializedLines(lines), [lines]);
  const currencyCode = currency?.code ?? "USD";
  const decimalPlaces = currency?.decimalPlaces ?? 2;

  const amountUntaxed = quotation?.amountUntaxed ?? "0";
  const amountTax = quotation?.amountTax ?? "0";
  const amountTotal = quotation?.amountTotal ?? "0";

  const lineNetSubtotal = useMemo(
    () =>
      lines.reduce((sum, line) => sum + Number(line.priceSubtotal ?? 0), 0),
    [lines],
  );
  const lineGrossSubtotal = useMemo(
    () => lines.reduce(
      (sum, line) => sum + Number(line.quantity) * Number(line.unitPrice),
      0,
    ),
    [lines],
  );
  const totalDiscount = Math.max(0, lineGrossSubtotal - lineNetSubtotal);
  const totalDiscountPercent = lineGrossSubtotal > 0
    ? Number(((totalDiscount / lineGrossSubtotal) * 100).toFixed(2))
    : 0;

  const deliveryFee = useMemo(
    () =>
      resolveDeliveryFee(
        lineNetSubtotal,
        quotation?.deliveryFeeAmount,
        quotation?.deliveryFeePercent,
      ),
    [lineNetSubtotal, quotation?.deliveryFeeAmount, quotation?.deliveryFeePercent],
  );

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

  async function handleSendEmail(input: {
    recipientEmail: string;
    subject: string;
    body: string;
  }) {
    if (!quotation) return;
    setEmailSending(true);
    try {
      await sendQuotationEmail(
        quotation.id,
        input.recipientEmail,
        input.subject,
        input.body,
      );
      setEmailSuccessBanner(
        `Sales Quotation PDF email successfully sent to ${input.recipientEmail}. Status updated to Quotation Sent.`,
      );
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
  const isSigned = quotation.state === "signed";
  const canShareSigningLink =
    quotation.state !== "cancelled" && quotation.state !== "confirmed";
  const docLabel = documentLabel(quotation.state);
  const canEdit = quotation.state === "draft" || quotation.state === "sent";

  const primaryAction = isCancelled
    ? undefined
    : isConfirmed
      ? {
          content: "Create Invoice",
          onAction: handleCreateInvoice,
        }
      : isSent || isSigned
        ? {
            content: "Confirm Sales Order",
            loading: actionLoading,
            onAction: () => void handleConfirm(),
          }
        : {
            content: "Send to Customer",
            onAction: () => setEmailModalOpen(true),
          };

  const secondaryActions = [
    ...(canEdit
      ? [
          {
            content: "Edit lines",
            onAction: () =>
              router.push(`/dashboard/sales/quotations/${quotation.id}/edit`),
          },
        ]
      : []),
    ...(isDraft
      ? [
          {
            content: "Mark as sent",
            loading: actionLoading,
            onAction: () => void handleMarkSent(),
          },
        ]
      : quotation.state !== "cancelled"
        ? [
            {
              content: "Send by email",
              onAction: () => setEmailModalOpen(true),
            },
          ]
        : []),
  ...(canShareSigningLink
    ? [
        {
          content: "Copy signing link",
          loading: copySigningLinkLoading,
          onAction: () => void handleCopySigningLink(),
        },
      ]
    : []),
    {
      content: "Preview PDF",
      onAction: () => setPdfModalOpen(true),
    },
    {
      content: "Internal notes",
      onAction: () => {
        setEditingInternalNotes(quotation.internalNotes || "");
        setInternalNotesModalOpen(true);
      },
    },
    ...(quotation.state !== "cancelled"
      ? [
          {
            content: "Cancel order",
            onAction: () => void handleCancel(),
          },
        ]
      : []),
    ...(isCancelled
      ? [
          {
            content: "Delete",
            destructive: true,
            onAction: () => setDeleteModalOpen(true),
          },
        ]
      : []),
  ];

  return (
    <AppPage
      backAction={{ content: "Quotations", url: "/dashboard/sales/quotations" }}
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
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
          <QuotationWorkflowPanel quotation={quotation} />
        </Card>

        <QuotationCustomerApprovalCard
          currencyCode={currencyCode}
          decimalPlaces={decimalPlaces}
          quotation={quotation}
          onPreviewPdf={() => setPdfModalOpen(true)}
        />

        <DealThreadPanel
          quotation={quotation}
          onUpdated={(updated) => setQuotation(updated)}
        />

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Internal Team Notes
                </Text>
                <Badge tone="info">Private — Team Only</Badge>
              </InlineStack>
              <Button
                size="slim"
                onClick={() => {
                  setEditingInternalNotes(quotation.internalNotes || "");
                  setInternalNotesModalOpen(true);
                }}
              >
                {quotation.internalNotes ? "Edit Internal Notes" : "Add Internal Notes"}
              </Button>
            </InlineStack>

            {quotation.internalNotes ? (
              <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                <Text as="p" variant="bodyMd">
                  {quotation.internalNotes}
                </Text>
              </Box>
            ) : (
              <Text as="p" tone="subdued">
                No internal team notes recorded for this quotation yet. Click above to leave private notes for staff.
              </Text>
            )}
          </BlockStack>
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
                          <th style={{ width: "10%", textAlign: "right" }}>Discount</th>
                          <th style={{ width: "10%", textAlign: "right" }}>Tax %</th>
                          <th style={{ width: "16%", textAlign: "right" }}>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayLines.map((line) => (
                          <tr key={line.id}>
                            <td>
                              <BlockStack gap="050">
                                <LineItemDescription
                                  details={line.productDescription}
                                  productId={line.productId}
                                  title={line.description}
                                />
                                {line.serialNumbers.length > 0 ? (
                                  <Text as="span" tone="subdued" variant="bodySm">
                                    SN:{" "}
                                    {line.sourceLines.map((sourceLine, index) => (
                                      <span key={sourceLine.id}>
                                        {index > 0 ? ", " : ""}
                                        {sourceLine.productUnitId ? (
                                          <Link url={`/dashboard/inventory/units/${sourceLine.productUnitId}`}>
                                            {sourceLine.serialNumber}
                                          </Link>
                                        ) : sourceLine.serialNumber}
                                      </span>
                                    ))}
                                  </Text>
                                ) : line.productUnitId ? (
                                  <Text as="span" tone="subdued" variant="bodySm">
                                    Serial-tracked item
                                  </Text>
                                ) : null}
                              </BlockStack>
                            </td>
                            <td>{formatQuantity(line.quantity)}</td>
                            <td style={{ textAlign: "right" }}>
                              {formatMoney(line.unitPrice, currencyCode, decimalPlaces)}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {formatDiscountLabel(
                                line.discountAmount,
                                line.discountPercent,
                                currencyCode,
                              )}
                            </td>
                            <td style={{ textAlign: "right" }}>{line.taxRatePercent}%</td>
                            <td style={{ textAlign: "right" }} className="frogmen-font-bold">
                              {formatMoney(
                                Number(line.quantity) * Number(line.unitPrice),
                                currencyCode,
                                decimalPlaces,
                              )}
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
                      {totalDiscount > 0 ? (
                        <>
                          <div className="quotation-summary-row">
                            <Text as="span" tone="subdued">Gross subtotal</Text>
                            <Text as="span" fontWeight="semibold">
                              {formatMoney(lineGrossSubtotal, currencyCode, decimalPlaces)}
                            </Text>
                          </div>
                          <div className="quotation-summary-row">
                            <Text as="span" tone="subdued">
                              Commercial discount ({totalDiscountPercent}%)
                            </Text>
                            <Text as="span" fontWeight="semibold" tone="success">
                              -{formatMoney(totalDiscount, currencyCode, decimalPlaces)}
                            </Text>
                          </div>
                        </>
                      ) : null}
                      {deliveryFee > 0 ? (
                        <>
                          <div className="quotation-summary-row">
                            <Text as="span" tone="subdued">
                              Line net
                            </Text>
                            <Text as="span" fontWeight="semibold">
                              {formatMoney(
                                lineNetSubtotal,
                                currencyCode,
                                decimalPlaces,
                              )}
                            </Text>
                          </div>
                          <div className="quotation-summary-row">
                            <Text as="span" tone="subdued">
                              Shipping fee
                              {quotation?.deliveryFeePercent
                                ? ` (${quotation.deliveryFeePercent}%)`
                                : ""}
                            </Text>
                            <Text as="span" fontWeight="semibold">
                              +
                              {formatMoney(
                                deliveryFee,
                                currencyCode,
                                decimalPlaces,
                              )}
                            </Text>
                          </div>
                        </>
                      ) : (
                        <div className="quotation-summary-row">
                          <Text as="span" tone="subdued">
                            Untaxed Amount
                          </Text>
                          <Text as="span" fontWeight="semibold">
                            {formatMoney(
                              amountUntaxed,
                              currencyCode,
                              decimalPlaces,
                            )}
                          </Text>
                        </div>
                      )}
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
                      {quotation.customerReference || "None"}
                    </Text>
                    <Text as="p">
                      <Text as="span" tone="subdued">Customer PO File: </Text>
                      {quotation.customerPoDocumentUrl ? (
                        <a
                          href={`/api/v1/files/${quotation.customerPoDocumentUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline font-semibold text-xs inline-flex items-center gap-1"
                        >
                          📎 View Uploaded PO File
                        </a>
                      ) : (
                        <Text as="span" tone="subdued">No PO file attached</Text>
                      )}
                    </Text>
                    <div className="pt-1">
                      <label className="inline-flex items-center px-3 py-1.5 border border-slate-300 rounded-md shadow-sm text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 cursor-pointer">
                        {poUploading ? "Uploading..." : "Upload Customer PO Document (PDF/Image)"}
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          className="hidden"
                          onChange={handlePoUpload}
                          disabled={poUploading}
                        />
                      </label>
                    </div>
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

      <SendDocumentEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        title={`Send sales quotation ${quotation.number} to customer`}
        pdfLabel={`quotation-${quotation.number}.pdf`}
        loading={emailSending}
        documentType="quotation"
        recipient={quotation.customerEmail ?? ""}
        placeholders={{
          number: quotation.number,
          customerName: quotation.customerName ?? "Customer",
          companyName: "",
          total: formatMoney(amountTotal, currencyCode, decimalPlaces),
        }}
        primaryActionLabel="Dispatch quotation email"
        onSend={handleSendEmail}
      />

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

      {/* ── Internal Notes Modal ── */}
      <Modal
        open={internalNotesModalOpen}
        onClose={() => setInternalNotesModalOpen(false)}
        title={`Internal Team Notes — ${quotation.number}`}
        primaryAction={{
          content: "Save Internal Notes",
          loading: savingInternalNotes,
          onAction: () => void handleSaveInternalNotes(),
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setInternalNotesModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" tone="subdued">
              Internal team notes are visible strictly to staff and team members. They will NEVER be printed or shown to the customer.
            </Text>
            <TextField
              autoComplete="off"
              label="Internal Notes"
              multiline={8}
              onChange={setEditingInternalNotes}
              placeholder="Private team notes (e.g. customer requested special delivery terms, battery warranty exception, internal approvals...)"
              value={editingInternalNotes}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
