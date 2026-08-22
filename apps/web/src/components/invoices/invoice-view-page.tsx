"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  Grid,
  InlineStack,
  Layout,
  Link,
  Modal,
  Select,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatCurrencyAmount } from "@/lib/currency-utils";
import { formatQuantity } from "@/lib/format-quantity";
import { LineItemDescription } from "@/components/sales/line-item-description";
import { todayIsoDate } from "@/components/sales/format-money";
import { AppPage } from "@/components/layout/page";
import { SendDocumentEmailModal } from "@/components/documents/send-document-email-modal";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { RegisterPaymentModal } from "@/components/invoices/register-payment-modal";
import { DeliveryNoteReviewModal } from "@/components/invoices/delivery-note-review-modal";
import {
  confirmInvoice,
  cancelInvoice,
  createCreditNoteFromInvoice,
  deleteCancelledInvoice,
  getInvoice,
  registerInvoicePayment,
  recordCreditNoteRefund,
  resetInvoiceToDraft,
  sendInvoiceEmail,
  sendInvoiceCancellationEmail,
  type Invoice,
} from "@/lib/invoices-api";
import { getInvoiceJournal } from "@/lib/accounting-api";
import { useToast } from "@/components/providers/toast-provider";
import { resolveDeliveryFee } from "@/lib/line-item-utils";

interface InvoiceViewPageProps {
  invoiceId: string;
}

export function InvoiceViewPage({ invoiceId }: InvoiceViewPageProps) {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const { resolveCurrency, currencies: orgCurrencies } = useOrgCurrency();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState(0);

  // Payment Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [creditNoteOpen, setCreditNoteOpen] = useState(false);
  const [creditNoteReason, setCreditNoteReason] = useState("");
  const [creditNoteDate, setCreditNoteDate] = useState(todayIsoDate());
  const [creditNoteProcessing, setCreditNoteProcessing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [returnToStock, setReturnToStock] = useState(false);
  const [cancelProcessing, setCancelProcessing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteProcessing, setDeleteProcessing] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [sendInvoiceOpen, setSendInvoiceOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("bank_transfer");
  const [refundReference, setRefundReference] = useState("");
  const [refundProcessing, setRefundProcessing] = useState(false);

  // PDF Preview Modal State
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [deliveryNoteOpen, setDeliveryNoteOpen] = useState(false);
  const [journalLines, setJournalLines] = useState<
    Awaited<ReturnType<typeof getInvoiceJournal>>["lines"]
  >([]);
  const [journalLoading, setJournalLoading] = useState(false);

  const workspaceTabs = [
    { id: "lines", content: "Invoice Lines" },
    { id: "journal", content: "Journal Items" },
    { id: "other", content: "Other Information" },
    { id: "terms", content: "Terms & Conditions" },
  ];

  const loadInvoiceData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInvoice(invoiceId);
      setInvoice(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    loadInvoiceData();
  }, [loadInvoiceData]);

  useEffect(() => {
    if (!invoice || invoice.status === "draft") {
      setJournalLines([]);
      return;
    }

    setJournalLoading(true);
    void getInvoiceJournal(invoice.id)
      .then((result) => setJournalLines(result.lines))
      .catch(() => setJournalLines([]))
      .finally(() => setJournalLoading(false));
  }, [invoice]);

  const documentCurrency = useMemo(
    () => (invoice ? resolveCurrency(invoice.currencyId) : null),
    [invoice, resolveCurrency],
  );

  const fmt = useCallback(
    (amount: number) => formatCurrencyAmount(amount, documentCurrency),
    [documentCurrency],
  );

  async function handleConfirmInvoice() {
    if (!invoice) return;
    setLoading(true);
    try {
      const updated = await confirmInvoice(invoice.id);
      setInvoice(updated);
      setSuccessBanner(`Invoice ${invoice.number} confirmed & posted to accounting ledger.`);
      setDeliveryNoteOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm invoice");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetToDraft() {
    if (!invoice) return;
    setLoading(true);
    try {
      const updated = await resetInvoiceToDraft(invoice.id);
      setInvoice(updated);
      setSuccessBanner(`Invoice ${invoice.number} reset back to Draft mode.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset to draft");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCreditNote() {
    if (!invoice) return;
    setCreditNoteProcessing(true);
    try {
      const cn = await createCreditNoteFromInvoice(invoice.id, {
        reason: creditNoteReason.trim(),
        creditDate: creditNoteDate,
      });
      setCreditNoteOpen(false);
      setSuccessBanner(
        `Credit Note ${cn.number} generated for ${invoice.customerName} in the amount of ${fmt(invoice.amountTotal)}.`
      );
      setTimeout(() => {
        router.push("/dashboard/invoices/credit-notes");
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create credit note");
    } finally {
      setCreditNoteProcessing(false);
    }
  }

  async function handleRegisterPayment(input: {
    amount: number;
    paymentDate: string;
    currencyId?: string;
    method: string;
    reference?: string;
    bankAccountId?: string;
  }) {
    if (!invoice) return;
    setPaymentProcessing(true);
    try {
      const updated = await registerInvoicePayment(invoice.id, {
        amount: input.amount,
        paymentDate: input.paymentDate,
        currencyId: input.currencyId,
        method: input.method,
        reference: input.reference,
        bankAccountId: input.bankAccountId,
      });
      setInvoice(updated);
      setPaymentModalOpen(false);
      setSuccessBanner(
        `Payment of ${fmt(input.amount)} registered. Invoice ${invoice.number} is ${updated.status === "paid" ? "fully paid" : "partially paid"}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register payment");
    } finally {
      setPaymentProcessing(false);
    }
  }

  async function handleCancelInvoice() {
    if (!invoice) return;
    setCancelProcessing(true);
    try {
      const updated = await cancelInvoice(invoice.id, { reason: cancelReason, returnToStock });
      setInvoice(updated);
      setCancelOpen(false);
      const creditNumber = updated.creditNote?.number;
      setEmailTo(updated.customerEmail);
      setEmailSubject(`Cancellation of invoice ${updated.number}`);
      setEmailBody(
        `Dear ${updated.customerName},\n\nWe apologize, but invoice ${updated.number} has been cancelled.${creditNumber ? ` Credit note ${creditNumber} has been issued.` : ""}\n\n${(updated.amountPaid ?? 0) > 0 ? `A refund of ${fmt(updated.amountPaid ?? 0)} is due and will be processed separately.` : "No payment refund is due."}\n\nKind regards`,
      );
      setEmailOpen(true);
      setSuccessBanner(`Invoice ${updated.number} cancelled.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel invoice");
    } finally {
      setCancelProcessing(false);
    }
  }

  async function handleSendCancellationEmail(input: {
    recipientEmail: string;
    subject: string;
    body: string;
  }) {
    if (!invoice) return;
    setEmailSending(true);
    try {
      await sendInvoiceCancellationEmail(invoice.id, input);
      setEmailOpen(false);
      setSuccessBanner("Cancellation email processed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Email delivery failed");
    } finally {
      setEmailSending(false);
    }
  }

  async function handleSendInvoiceEmail(input: {
    recipientEmail: string;
    subject: string;
    body: string;
  }) {
    if (!invoice) return;
    setEmailSending(true);
    try {
      await sendInvoiceEmail(invoice.id, input);
      setSendInvoiceOpen(false);
      setSuccessBanner(`Invoice ${invoice.number} emailed to ${input.recipientEmail}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Email delivery failed");
    } finally {
      setEmailSending(false);
    }
  }

  async function handleRefund() {
    if (!invoice?.creditNote) return;
    setRefundProcessing(true);
    try {
      await recordCreditNoteRefund(invoice.creditNote.id, {
        amount: Number(refundAmount),
        currencyId: invoice.currencyId,
        refundDate: todayIsoDate(),
        method: refundMethod,
        reference: refundReference || undefined,
      });
      setRefundOpen(false);
      await loadInvoiceData();
      setSuccessBanner("Customer refund recorded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setRefundProcessing(false);
    }
  }

  const paymentCurrencyOptions = useMemo(
    () =>
      orgCurrencies.map((currency) => ({
        label: `${currency.code.trim()}   ${currency.name}`,
        value: currency.id,
      })),
    [orgCurrencies],
  );

  if (loading && !invoice) {
    return (
      <AppPage title="Loading Invoice...">
        <Text as="p" tone="subdued">Loading commercial invoice workspace...</Text>
      </AppPage>
    );
  }

  if (!invoice) {
    return (
      <AppPage title="Invoice Not Found">
        <Banner tone="critical">The requested commercial invoice could not be found.</Banner>
      </AppPage>
    );
  }

  const isDraft = invoice.status === "draft";
  const isPosted = invoice.status === "posted" || invoice.status === "paid";
  const isPaid = invoice.status === "paid";
  const isCancelled = invoice.status === "cancelled";
  const canPay = isPosted && !isPaid;

  const rawSubtotal = invoice.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const deliveryFee = resolveDeliveryFee(
    rawSubtotal,
    invoice.deliveryFeeAmount,
    invoice.deliveryFeePercent,
  );

  return (
    <AppPage
      backAction={{ content: "Invoices Directory", url: "/dashboard/invoices" }}
      fullWidth
      primaryAction={
        isDraft
          ? {
              content: "Confirm & Post Invoice",
              loading,
              onAction: () => void handleConfirmInvoice(),
            }
          : canPay
            ? {
                content: "Register Payment",
                onAction: () => setPaymentModalOpen(true),
              }
            : undefined
      }
      subtitle={`Commercial Document #${invoice.number} • Customer: ${invoice.customerName}`}
      title={`Customer Invoice ${invoice.number}`}
    >
      <BlockStack gap="500">
        {successBanner ? (
          <Banner
            tone="success"
            action={
              isPosted && !deliveryNoteOpen
                ? { content: "Create delivery note", onAction: () => setDeliveryNoteOpen(true) }
                : undefined
            }
          >
            {successBanner}
          </Banner>
        ) : null}
        {error ? <Banner tone="critical">{error}</Banner> : null}
        {isCancelled ? (
          <Banner tone="warning">
            Cancelled: {invoice.cancellationReason || "No reason recorded"}.
            {invoice.creditNote ? ` Credit note ${invoice.creditNote.number}.` : ""}
            {(invoice.creditNote?.refundDue ?? 0) > 0
              ? ` Refund due: ${fmt((invoice.creditNote?.refundDue ?? 0) - (invoice.creditNote?.refundPaid ?? 0))}.`
              : ""}
          </Banner>
        ) : null}
        {isDraft ? (
          <Banner tone="warning">
            This invoice is still a draft. Confirm & post it before registering payment.
            Posting locks the exchange rate and marks the linked sales order as invoiced.
          </Banner>
        ) : null}

        {/* ── Top Odoo Action Bar & Stepper ── */}
        <Card padding="300">
          <InlineStack align="space-between" blockAlign="center">
            {/* Odoo Command Toolbar Buttons */}
            <InlineStack gap="200" blockAlign="center">
              {isDraft ? (
                <Button
                  size="slim"
                  variant="primary"
                  loading={loading}
                  onClick={() => void handleConfirmInvoice()}
                >
                  Confirm & Post
                </Button>
              ) : null}
              <Button size="slim" onClick={() => setPdfModalOpen(true)}>
                Preview
              </Button>
              {invoice.status === "posted" || invoice.status === "paid" ? (
                <Button size="slim" onClick={() => setSendInvoiceOpen(true)}>
                  Send by email
                </Button>
              ) : null}
              {isPosted ? (
                <Button size="slim" onClick={() => setDeliveryNoteOpen(true)}>
                  Delivery note
                </Button>
              ) : null}
              <Button
                size="slim"
                variant={canPay ? "primary" : "secondary"}
                disabled={!canPay}
                onClick={() => setPaymentModalOpen(true)}
              >
                Pay
              </Button>
              <Button
                size="slim"
                disabled={isCancelled}
                onClick={() => setCancelOpen(true)}
              >
                Cancel Invoice
              </Button>
              {isCancelled ? (
                <>
                  {(invoice.creditNote?.refundDue ?? 0) > (invoice.creditNote?.refundPaid ?? 0) ? (
                    <Button size="slim" variant="primary" onClick={() => {
                      setRefundAmount(String((invoice.creditNote?.refundDue ?? 0) - (invoice.creditNote?.refundPaid ?? 0)));
                      setRefundOpen(true);
                    }}>Record refund</Button>
                  ) : null}
                  <Button tone="critical" size="slim" onClick={() => setDeleteOpen(true)}>
                    Delete
                  </Button>
                </>
              ) : null}
            </InlineStack>

            {/* Odoo Dual Stepper: State & Payment State */}
            <InlineStack gap="400" blockAlign="center">
              <InlineStack gap="150" blockAlign="center">
                <Text as="span" tone="subdued" variant="bodySm">
                  State:
                </Text>
                {invoice.status === "draft" ? (
                  <Badge>Draft</Badge>
                ) : invoice.status === "cancelled" ? (
                  <Badge tone="warning">Cancelled</Badge>
                ) : (
                  <Badge tone="info">Posted</Badge>
                )}
              </InlineStack>

              <InlineStack gap="150" blockAlign="center">
                <Text as="span" tone="subdued" variant="bodySm">
                  Payment state:
                </Text>
                {invoice.status === "paid" ? (
                  <Badge tone="success">Paid</Badge>
                ) : (
                  <Badge tone="critical">Not paid</Badge>
                )}
              </InlineStack>
            </InlineStack>
          </InlineStack>
        </Card>

        {/* ── Customer Invoice Header Details ── */}
        <Card>
          <BlockStack gap="500">
            <Text as="h2" variant="headingMd">
              General Customer Invoice Header
            </Text>

            <Grid>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                <BlockStack gap="050">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Customer Invoice
                  </Text>
                  <Text as="span" fontWeight="bold" variant="headingSm">
                    {invoice.number}
                  </Text>
                </BlockStack>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                <BlockStack gap="050">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Customer Account
                  </Text>
                  <Text as="span" fontWeight="bold" variant="bodyMd">
                    {invoice.customerName}
                  </Text>
                  <Text as="span" tone="subdued" variant="bodySm">
                    {invoice.customerEmail}
                  </Text>
                </BlockStack>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 4, xl: 4 }}>
                <BlockStack gap="050">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Invoice Date
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {invoice.invoiceDate}
                  </Text>
                </BlockStack>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 4, xl: 4 }}>
                <BlockStack gap="050">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Payment Term
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {invoice.paymentTerm}
                  </Text>
                </BlockStack>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 4, xl: 4 }}>
                <BlockStack gap="050">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Journal
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    Customer Invoices
                  </Text>
                </BlockStack>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 4, xl: 4 }}>
                <BlockStack gap="050">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Currency
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {invoice.currencyCode ?? documentCurrency?.code ?? " "}
                  </Text>
                </BlockStack>
              </Grid.Cell>
            </Grid>

            <Divider />

            {/* ── 4 Workspace Content Tabs ── */}
            <Tabs
              tabs={workspaceTabs}
              selected={selectedTab}
              onSelect={setSelectedTab}
            />

            {/* ── TAB 0: INVOICE LINES ── */}
            {selectedTab === 0 ? (
              <BlockStack gap="400">
                <div className="frogmen-recent-table-wrapper">
                  <table className="frogmen-recent-table">
                    <thead>
                      <tr>
                        <th style={{ width: "40%" }}>Product</th>
                        <th style={{ width: "15%", textAlign: "right" }}>Quantity</th>
                        <th style={{ width: "15%", textAlign: "right" }}>Unit Price</th>
                        <th style={{ width: "10%", textAlign: "right" }}>Taxes</th>
                        <th style={{ width: "20%", textAlign: "right" }}>Sub Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.lines.map((l) => (
                        <tr key={l.id}>
                          <td className="frogmen-font-bold">
                            <BlockStack gap="050">
                              <LineItemDescription
                                details={l.productDescription}
                                productId={l.productId}
                                title={l.description}
                              />
                              {l.serialNumber ? (
                                <Text as="span" tone="subdued" variant="bodySm">
                                  SN:{" "}
                                  {l.productUnitId ? (
                                    <Link
                                      url={`/dashboard/inventory/units/${l.productUnitId}`}
                                    >
                                      {l.serialNumber}
                                    </Link>
                                  ) : (
                                    l.serialNumber
                                  )}
                                </Text>
                              ) : null}
                            </BlockStack>
                          </td>
                          <td style={{ textAlign: "right" }}>{formatQuantity(l.quantity)}</td>
                          <td style={{ textAlign: "right" }}>
                            {fmt(l.unitPrice)}
                          </td>
                          <td style={{ textAlign: "right" }}>{l.taxRatePercent}%</td>
                          <td style={{ textAlign: "right" }} className="frogmen-font-bold">
                            {fmt(l.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <InlineStack align="end">
                  <div style={{ width: "340px" }}>
                    <div className="quotation-summary-panel__rows">
                      {deliveryFee > 0 ? (
                        <>
                          <div className="quotation-summary-row">
                            <Text as="span" tone="subdued">Line net</Text>
                            <Text as="span" fontWeight="semibold">
                              {fmt(rawSubtotal)}
                            </Text>
                          </div>
                          <div className="quotation-summary-row">
                            <Text as="span" tone="subdued">
                              Delivery fee
                              {invoice.deliveryFeePercent
                                ? ` (${invoice.deliveryFeePercent}%)`
                                : ""}
                            </Text>
                            <Text as="span" fontWeight="semibold">
                              +{fmt(deliveryFee)}
                            </Text>
                          </div>
                        </>
                      ) : (
                        <div className="quotation-summary-row">
                          <Text as="span" tone="subdued">Untaxed Amount</Text>
                          <Text as="span" fontWeight="semibold">
                            {fmt(rawSubtotal)}
                          </Text>
                        </div>
                      )}
                      <div className="quotation-summary-row">
                        <Text as="span" tone="subdued">Tax (5%)</Text>
                        <Text as="span" fontWeight="semibold">
                          {fmt(invoice.amountTax)}
                        </Text>
                      </div>
                      <Divider />
                      <div className="quotation-summary-row">
                        <Text as="span" variant="headingMd" fontWeight="bold">Total</Text>
                        <Text as="span" variant="headingLg" fontWeight="bold">
                          {fmt(invoice.amountTotal)}
                        </Text>
                      </div>
                      <div className="quotation-summary-row">
                        <Text as="span" tone="subdued" fontWeight="bold">Amount Due</Text>
                        <Text
                          as="span"
                          variant="headingLg"
                          fontWeight="bold"
                          tone={invoice.status === "paid" ? "success" : "critical"}
                        >
                          {invoice.status === "paid" ? fmt(0) : fmt(invoice.amountTotal)}
                        </Text>
                      </div>
                    </div>
                  </div>
                </InlineStack>
              </BlockStack>
            ) : null}

            {/* ── TAB 1: JOURNAL ITEMS ── */}
            {selectedTab === 1 ? (
              <BlockStack gap="300">
                {invoice.status === "draft" ? (
                  <Banner tone="info">
                    Post this invoice to generate accounting journal entries.
                  </Banner>
                ) : journalLoading ? (
                  <Text as="p" tone="subdued">
                    Loading journal entries...
                  </Text>
                ) : journalLines.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No journal entries found for this invoice yet.
                  </Text>
                ) : (
                  <div className="frogmen-recent-table-wrapper">
                    <table className="frogmen-recent-table">
                      <thead>
                        <tr>
                          <th>Account</th>
                          <th>Label</th>
                          <th style={{ textAlign: "right" }}>Debit</th>
                          <th style={{ textAlign: "right" }}>Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {journalLines.map((line) => (
                          <tr key={line.id}>
                            <td className="frogmen-font-bold">
                              {line.accountCode} {line.accountName}
                            </td>
                            <td>{line.label}</td>
                            <td style={{ textAlign: "right" }} className="frogmen-font-bold">
                              {line.debit > 0 ? fmt(line.debit) : fmt(0)}
                            </td>
                            <td style={{ textAlign: "right" }} className="frogmen-font-bold">
                              {line.credit > 0 ? fmt(line.credit) : fmt(0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </BlockStack>
            ) : null}

            {/* ── TAB 2: OTHER INFORMATION ── */}
            {selectedTab === 2 ? (
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Document references</Text>
                <Text as="p" tone="subdued">
                  Customer PO reference: {invoice.customerReference || "Not provided"}
                </Text>
                <Text as="p" tone="subdued">
                  Payment reference: {invoice.number}
                </Text>
              </BlockStack>
            ) : null}

            {/* ── TAB 3: TERMS & CONDITIONS ── */}
            {selectedTab === 3 ? (
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">Terms & conditions</Text>
                <Text as="p" tone="subdued">
                  {invoice.notes || "No terms or conditions were added to this invoice."}
                </Text>
              </BlockStack>
            ) : null}
          </BlockStack>
        </Card>
      </BlockStack>

      <RegisterPaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        invoice={invoice}
        canPay={canPay}
        processing={paymentProcessing}
        currencyOptions={paymentCurrencyOptions}
        resolveCurrency={resolveCurrency}
        onSubmit={handleRegisterPayment}
      />

      <Modal
        open={cancelOpen}
        title={`Cancel invoice ${invoice.number}`}
        onClose={() => setCancelOpen(false)}
        primaryAction={{
          content: "Cancel invoice",
          destructive: true,
          loading: cancelProcessing,
          disabled: !cancelReason.trim(),
          onAction: () => void handleCancelInvoice(),
        }}
        secondaryActions={[{ content: "Keep invoice", onAction: () => setCancelOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Banner tone="warning">
              Posted invoices are reversed with a credit note. Existing payments remain immutable and become a refund due.
            </Banner>
            <TextField autoComplete="off" label="Cancellation reason" multiline={3} value={cancelReason} onChange={setCancelReason} />
            <Checkbox
              label="Return invoice items to stock"
              helpText="Restores serialized and bulk inventory and voids warranties for returned items."
              checked={returnToStock}
              onChange={setReturnToStock}
            />
            <Text as="p" tone="subdued">
              Paid: {fmt(invoice.amountPaid ?? 0)} · {invoice.lines.length} affected line(s)
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={deleteOpen}
        title={`Delete cancelled invoice ${invoice.number}?`}
        onClose={() => setDeleteOpen(false)}
        primaryAction={{
          content: "Delete invoice",
          destructive: true,
          loading: deleteProcessing,
          onAction: async () => {
            setDeleteProcessing(true);
            try {
              await deleteCancelledInvoice(invoice.id);
              showSuccess(`Cancelled invoice ${invoice.number} deleted.`);
              router.push("/dashboard/invoices");
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Failed to delete invoice";
              setError(message);
              showError(message);
              setDeleteProcessing(false);
            }
          },
        }}
        secondaryActions={[
          { content: "Keep invoice", onAction: () => setDeleteOpen(false) },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            This removes the cancelled invoice from normal lists. Accounting
            reversals, payments, credit notes, refunds, audit history, and its
            document number remain preserved.
          </Text>
        </Modal.Section>
      </Modal>

      <SendDocumentEmailModal
        open={sendInvoiceOpen}
        onClose={() => setSendInvoiceOpen(false)}
        title={`Send invoice ${invoice.number}`}
        pdfLabel={`invoice-${invoice.number}.pdf`}
        loading={emailSending}
        documentType="invoice"
        recipient={invoice.customerEmail}
        placeholders={{
          number: invoice.number,
          customerName: invoice.customerName,
          companyName: "",
          total: fmt(invoice.amountTotal),
          dueDate: invoice.dueDate,
          outstanding: fmt(Math.max(invoice.amountTotal - (invoice.amountPaid ?? 0), 0)),
        }}
        primaryActionLabel="Send invoice email"
        onSend={handleSendInvoiceEmail}
      />

      <SendDocumentEmailModal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        title="Send cancellation email"
        pdfLabel={invoice.creditNote ? `${invoice.creditNote.number}.pdf` : undefined}
        loading={emailSending}
        documentType="quotation"
        recipient={emailTo}
        initialSubject={emailSubject}
        initialBody={emailBody}
        placeholders={{
          number: invoice.number,
          customerName: invoice.customerName,
          companyName: "",
          total: fmt(invoice.amountTotal),
        }}
        primaryActionLabel="Send cancellation email"
        onSend={handleSendCancellationEmail}
      />

      <Modal
        open={refundOpen}
        title="Record customer refund"
        onClose={() => setRefundOpen(false)}
        primaryAction={{
          content: "Record refund",
          loading: refundProcessing,
          disabled: Number(refundAmount) <= 0,
          onAction: () => void handleRefund(),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setRefundOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <TextField autoComplete="off" label="Refund amount" type="number" value={refundAmount} onChange={setRefundAmount} />
            <Select label="Refund method" value={refundMethod} onChange={setRefundMethod} options={[
              { label: "Bank transfer", value: "bank_transfer" },
              { label: "Cash", value: "cash" },
            ]} />
            <TextField autoComplete="off" label="Reference" value={refundReference} onChange={setRefundReference} />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={creditNoteOpen}
        title={`Create credit note for ${invoice.number}`}
        onClose={() => setCreditNoteOpen(false)}
        primaryAction={{
          content: "Post full credit note",
          loading: creditNoteProcessing,
          disabled: !creditNoteReason.trim(),
          onAction: () => void handleCreateCreditNote(),
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setCreditNoteOpen(false) },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Banner tone="warning">
              This posts a full financial reversal for {fmt(invoice.amountTotal)}.
              It does not automatically return serialized equipment to stock.
            </Banner>
            <TextField
              autoComplete="off"
              label="Credit date"
              type="date"
              value={creditNoteDate}
              onChange={setCreditNoteDate}
            />
            <TextField
              autoComplete="off"
              label="Reason"
              placeholder="Returned goods, pricing correction, cancelled service..."
              multiline={3}
              value={creditNoteReason}
              onChange={setCreditNoteReason}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <DocumentPreviewModal
        documentType="invoice"
        onClose={() => setPdfModalOpen(false)}
        open={pdfModalOpen}
        quotationId={invoice.id}
        quotationNumber={invoice.number}
        title="Invoice PDF preview"
      />

      <DeliveryNoteReviewModal
        invoiceId={invoice.id}
        invoiceNumber={invoice.number}
        open={deliveryNoteOpen}
        onClose={() => setDeliveryNoteOpen(false)}
      />
    </AppPage>
  );
}
