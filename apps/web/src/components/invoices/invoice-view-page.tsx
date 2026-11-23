"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  Icon,
  InlineStack,
  Link,
  Modal,
  Select,
  SkeletonBodyText,
  Text,
  TextField,
  type IconSource,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  CheckIcon,
  EmailIcon,
  NoteIcon,
  ReceiptIcon,
  XCircleIcon,
} from "@shopify/polaris-icons";
import { cn } from "@/lib/utils";
import { billingDocumentTypeLabel } from "@frog1/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatCurrencyAmount } from "@/lib/currency-utils";
import { formatAppDate, formatAppDateTime } from "@/lib/format-date";
import { formatQuantity } from "@/lib/format-quantity";
import { LineItemDescription } from "@/components/sales/line-item-description";
import { todayIsoDate } from "@/components/sales/format-money";
import { AppPage } from "@/components/layout/page";
import { SendDocumentEmailModal } from "@/components/documents/send-document-email-modal";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { InvoiceDocumentBankModal } from "@/components/invoices/invoice-document-bank-modal";
import { listBankAccounts } from "@/lib/bank-accounts-api";
import type { BankAccount } from "@/lib/bank-accounts-api";
import {
  getInvoiceDocumentBankCandidates,
  getInvoicePaymentBankStatus,
} from "@/lib/invoice-document-bank";
import { RegisterPaymentModal } from "@/components/invoices/register-payment-modal";
import { DeliveryNoteReviewModal } from "@/components/invoices/delivery-note-review-modal";
import { EditInvoiceDetailsModal } from "@/components/invoices/edit-invoice-details-modal";
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
  updateInvoiceDetails,
  type Invoice,
} from "@/lib/invoices-api";
import { getInvoiceJournal } from "@/lib/accounting-api";
import { useToast } from "@/components/providers/toast-provider";
import { resolveDeliveryFee } from "@/lib/line-item-utils";

const INVOICE_ACTIVITY_ICON: Record<string, IconSource> = {
  created: NoteIcon,
  posted: ReceiptIcon,
  confirmed: ReceiptIcon,
  paid: CheckCircleIcon,
  payment: CheckCircleIcon,
  sent: EmailIcon,
  email: EmailIcon,
  cancelled: XCircleIcon,
};

function daysFromToday(date: string) {
  const target = new Date(`${date.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function shortDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function initials(name: string) {
  return name
    .split(/s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

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
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [savingDocumentBank, setSavingDocumentBank] = useState(false);
  const [deliveryNoteOpen, setDeliveryNoteOpen] = useState(false);
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  const [journalLines, setJournalLines] = useState<
    Awaited<ReturnType<typeof getInvoiceJournal>>["lines"]
  >([]);
  const [journalLoading, setJournalLoading] = useState(false);

  const loadInvoiceData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Bank accounts only feed the payment details; a role without access still sees the invoice.
      const [data, banks] = await Promise.all([
        getInvoice(invoiceId),
        listBankAccounts({ activeOnly: true }).catch(() => []),
      ]);
      setInvoice(data);
      setBankAccounts(banks);
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

  const invoiceBankCandidates = useMemo(
    () =>
      invoice
        ? getInvoiceDocumentBankCandidates(
            bankAccounts,
            invoice.currencyCode ?? "AED",
          )
        : [],
    [bankAccounts, invoice],
  );

  function openInvoicePreview() {
    if (!invoice) return;
    const status = getInvoicePaymentBankStatus(
      bankAccounts,
      invoice.currencyCode ?? "AED",
      invoice.documentBankAccountId,
    );
    if (status === "ready") {
      setPdfModalOpen(true);
      return;
    }
    setBankModalOpen(true);
  }

  async function handleSaveDocumentBank(bankAccountId: string) {
    if (!invoice) return;
    setSavingDocumentBank(true);
    try {
      const updated = await updateInvoiceDetails(invoice.id, {
        documentBankAccountId: bankAccountId,
        reason: "Selected payment bank account for invoice PDF",
      });
      setInvoice(updated);
      setBankModalOpen(false);
      setPdfModalOpen(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save payment bank",
      );
    } finally {
      setSavingDocumentBank(false);
    }
  }

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
      <AppPage backAction={{ content: "Invoices", url: "/dashboard/invoices" }} title="Invoice">
        <Card>
          <SkeletonBodyText lines={10} />
        </Card>
      </AppPage>
    );
  }

  if (!invoice) {
    return (
      <AppPage backAction={{ content: "Invoices", url: "/dashboard/invoices" }} title="Invoice not found">
        <Banner tone="critical">{error || "This invoice could not be found."}</Banner>
      </AppPage>
    );
  }

  const isDraft = invoice.status === "draft";
  const isPosted = invoice.status === "posted" || invoice.status === "paid";
  const isPaid = invoice.status === "paid";
  const isCancelled = invoice.status === "cancelled";
  const canPay = isPosted && !isPaid;

  const rawSubtotal = invoice.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const deliveryFee = resolveDeliveryFee(rawSubtotal, invoice.deliveryFeeAmount, invoice.deliveryFeePercent);
  const invoiceBillingLabel = billingDocumentTypeLabel(invoice.billingDocumentType ?? "tax_invoice");
  const amountPaid = isPaid ? invoice.amountTotal : Math.min(invoice.amountPaid ?? 0, invoice.amountTotal);
  const amountDue = isCancelled ? 0 : Math.max(0, invoice.amountTotal - amountPaid);
  const paidShare = invoice.amountTotal > 0 ? (amountPaid / invoice.amountTotal) * 100 : 0;
  const taxRates = [...new Set(invoice.lines.map((l) => Number(l.taxRatePercent)))];
  const taxLabel = taxRates.length === 1 ? `Tax (${taxRates[0]}%)` : "Tax";
  const dueDays = invoice.dueDate ? daysFromToday(invoice.dueDate) : null;
  const overdue = canPay && dueDays !== null && dueDays < 0;
  const refundOutstanding = (invoice.creditNote?.refundDue ?? 0) - (invoice.creditNote?.refundPaid ?? 0);
  const activities = [...(invoice.activities ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const activityDate = (types: string[]) => {
    const found = [...(invoice.activities ?? [])]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .find((a) => types.includes(a.activityType) || types.some((t) => new RegExp(`\b${t}\b`, "i").test(a.message)));
    return found ? shortDateTime(found.createdAt) : null;
  };

  const steps = [
    { label: "Draft", done: !isDraft, now: isDraft, date: activityDate(["created"]) },
    { label: "Posted", done: isPosted && (isPaid || amountPaid > 0), now: isPosted && !isPaid && amountPaid === 0, date: activityDate(["posted", "confirmed"]) },
    { label: amountPaid > 0 && !isPaid ? "Part paid" : "Paid", done: isPaid, now: isPosted && !isPaid && amountPaid > 0, date: activityDate(["paid", "payment", "registered"]) },
  ];

  const next = (() => {
    if (isCancelled) {
      return refundOutstanding > 0
        ? { tone: "warn", title: "Refund due to the customer", text: `${fmt(refundOutstanding)} was paid on this cancelled invoice and still needs refunding.`, label: "Record refund", onClick: () => { setRefundAmount(String(refundOutstanding)); setRefundOpen(true); } }
        : { tone: "done", title: "Cancelled", text: `${invoice.cancellationReason || "No reason recorded"}${invoice.creditNote ? ` · credit note ${invoice.creditNote.number}` : ""}.`, label: null, onClick: null };
    }
    if (isDraft) {
      return { tone: "wait", title: "Draft — not issued yet", text: "Check the lines, then post it. Posting locks the exchange rate and marks the sales order as invoiced.", label: "Post invoice", onClick: () => void handleConfirmInvoice() };
    }
    if (isPaid) {
      return { tone: "done", title: "Paid in full", text: `${invoice.customerName} has paid ${fmt(invoice.amountTotal)}. Nothing left to collect.`, label: null, onClick: null };
    }
    if (overdue) {
      return { tone: "bad", title: `${Math.abs(dueDays!)} days overdue`, text: `${fmt(amountDue)} was due on ${formatAppDate(invoice.dueDate)}. Record a payment or send a reminder.`, label: "Record payment", onClick: () => setPaymentModalOpen(true) };
    }
    return {
      tone: "go",
      title: amountPaid > 0 ? `${fmt(amountDue)} still to collect` : "Waiting for payment",
      text: invoice.dueDate ? `Due ${dueDays === 0 ? "today" : `in ${dueDays} days`} (${formatAppDate(invoice.dueDate)}).` : "No due date set.",
      label: "Record payment",
      onClick: () => setPaymentModalOpen(true),
    };
  })();

  const moreActions = [
    ...(isPosted ? [{ content: "Delivery note", onAction: () => setDeliveryNoteOpen(true) }] : []),
    ...(isPosted ? [{ content: "Create credit note", onAction: () => setCreditNoteOpen(true) }] : []),
    ...(invoice.status === "posted" && amountPaid === 0 ? [{ content: "Reset to draft", onAction: () => void handleResetToDraft() }] : []),
    ...(!isCancelled ? [{ content: "Cancel invoice", destructive: true, onAction: () => setCancelOpen(true) }] : []),
    ...(isCancelled ? [{ content: "Delete", destructive: true, onAction: () => setDeleteOpen(true) }] : []),
  ];

  return (
    <AppPage
      actionGroups={moreActions.length ? [{ title: "More", actions: moreActions }] : undefined}
      backAction={{ content: "Invoices", url: "/dashboard/invoices" }}
      fullWidth
      primaryAction={next.label && next.onClick ? { content: next.label, loading, onAction: next.onClick } : undefined}
      secondaryActions={[
        { content: "Preview PDF", onAction: openInvoicePreview },
        ...(isPosted ? [{ content: "Send by email", onAction: () => setSendInvoiceOpen(true) }] : []),
        ...(!isCancelled ? [{ content: "Edit details", onAction: () => setEditDetailsOpen(true) }] : []),
      ]}
      subtitle={`${invoice.customerName} · ${invoiceBillingLabel}`}
      title={`Invoice ${invoice.number}`}
      titleMetadata={
        <Badge tone={isPaid ? "success" : isCancelled ? "critical" : isDraft ? undefined : overdue ? "critical" : "attention"}>
          {isPaid ? "Paid" : isCancelled ? "Cancelled" : isDraft ? "Draft" : overdue ? "Overdue" : amountPaid > 0 ? "Part paid" : "Unpaid"}
        </Badge>
      }
    >
      <BlockStack gap="400">
        {successBanner ? (
          <Banner
            action={isPosted && !deliveryNoteOpen ? { content: "Create delivery note", onAction: () => setDeliveryNoteOpen(true) } : undefined}
            tone="success"
            onDismiss={() => setSuccessBanner(null)}
          >
            {successBanner}
          </Banner>
        ) : null}
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        {/* Hero */}
        <section className={cn("qv-hero", isCancelled && "is-cancelled")}>
          <div className="qv-hero__top">
            <div className="qv-hero__who">
              <span className="qv-hero__avatar">{initials(invoice.customerName)}</span>
              <div>
                <span className="qv-hero__label">Invoice to</span>
                <strong>{invoice.customerName}</strong>
                {invoice.customerEmail ? <small>{invoice.customerEmail}</small> : null}
              </div>
            </div>
            <div className="qv-hero__total">
              <span className="qv-hero__label">{isPaid || isCancelled || isDraft ? "Total" : "Amount due"}</span>
              <strong>{fmt(isPaid || isCancelled || isDraft ? invoice.amountTotal : amountDue)}</strong>
              <small>
                {isPaid || isCancelled || isDraft
                  ? `${fmt(invoice.amountUntaxed)} + ${fmt(invoice.amountTax)} tax`
                  : `of ${fmt(invoice.amountTotal)} · ${fmt(amountPaid)} paid`}
              </small>
            </div>
          </div>

          <div className="qv-hero__facts">
            <div>
              <span>Invoice date</span>
              <strong>{formatAppDate(invoice.invoiceDate)}</strong>
            </div>
            <div className={cn(overdue && "is-bad", canPay && dueDays !== null && dueDays >= 0 && dueDays <= 7 && "is-warn")}>
              <span>Due date</span>
              <strong>{invoice.dueDate ? formatAppDate(invoice.dueDate) : "—"}</strong>
              {canPay && dueDays !== null ? (
                <small>{dueDays < 0 ? `${Math.abs(dueDays)}d overdue` : dueDays === 0 ? "due today" : `${dueDays} days left`}</small>
              ) : null}
            </div>
            <div>
              <span>Customer PO</span>
              <strong>{invoice.customerReference || "—"}</strong>
            </div>
            <div>
              <span>Currency</span>
              <strong>{invoice.currencyCode ?? documentCurrency?.code ?? "—"}</strong>
            </div>
          </div>

          <ol className={cn("qv-steps iv-steps", isCancelled && "is-cancelled")}>
            {steps.map((step, i) => (
              <li className={cn(!isCancelled && step.done && "is-done", !isCancelled && step.now && "is-now")} key={step.label}>
                <span className="qv-steps__dot">{!isCancelled && step.done ? <Icon source={CheckIcon} /> : i + 1}</span>
                <span className="qv-steps__text">
                  <strong>{step.label}</strong>
                  <small>{step.date ?? (step.now && !isCancelled ? "current" : "")}</small>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className={cn("qv-next", `is-${next.tone === "bad" ? "critical" : next.tone}`)}>
          <div>
            <strong>{next.title}</strong>
            <span>{next.text}</span>
          </div>
          {next.label && next.onClick ? (
            <Button loading={loading} variant="primary" onClick={next.onClick}>
              {next.label}
            </Button>
          ) : null}
        </div>

        <div className="qv-layout">
          <div className="qv-main">
            <Card padding="0">
              <div className="qv-card-head">
                <Text as="h2" variant="headingMd">
                  Items
                </Text>
                <Text as="span" tone="subdued" variant="bodySm">
                  {invoice.lines.length} line{invoice.lines.length === 1 ? "" : "s"}
                </Text>
              </div>
              <div className="qv-lines">
                <div className="qv-lines__head iv-lines">
                  <span>Item</span>
                  <span>Qty</span>
                  <span>Unit price</span>
                  <span>Tax</span>
                  <span>Amount</span>
                </div>
                {invoice.lines.map((l) => (
                  <div className="qv-lines__row iv-lines" key={l.id}>
                    <div className="qv-lines__item">
                      <LineItemDescription details={l.productDescription} productId={l.productId} title={l.description} />
                      {l.serialNumber ? (
                        <small>
                          SN{" "}
                          {l.productUnitId ? <Link url={`/dashboard/inventory/units/${l.productUnitId}`}>{l.serialNumber}</Link> : l.serialNumber}
                        </small>
                      ) : null}
                    </div>
                    <span className="qv-num" data-label="Qty">{formatQuantity(l.quantity)}</span>
                    <span className="qv-num" data-label="Unit price">{fmt(l.unitPrice)}</span>
                    <span className="qv-num is-muted" data-label="Tax">{l.taxRatePercent}%</span>
                    <span className="qv-num is-strong" data-label="Amount">{fmt(l.lineTotal)}</span>
                  </div>
                ))}
              </div>
              <div className="qv-totals">
                <dl>
                  {deliveryFee > 0 ? (
                    <>
                      <div>
                        <dt>Items</dt>
                        <dd>{fmt(rawSubtotal)}</dd>
                      </div>
                      <div>
                        <dt>Shipping{invoice.deliveryFeePercent ? ` (${invoice.deliveryFeePercent}%)` : ""}</dt>
                        <dd>+{fmt(deliveryFee)}</dd>
                      </div>
                    </>
                  ) : (
                    <div>
                      <dt>Subtotal</dt>
                      <dd>{fmt(invoice.amountUntaxed)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{taxLabel}</dt>
                    <dd>+{fmt(invoice.amountTax)}</dd>
                  </div>
                  <div className="is-total">
                    <dt>Total</dt>
                    <dd>{fmt(invoice.amountTotal)}</dd>
                  </div>
                  {isPosted ? (
                    <>
                      <div className="is-good">
                        <dt>Paid</dt>
                        <dd>−{fmt(amountPaid)}</dd>
                      </div>
                      <div className={cn("iv-due-row", amountDue > 0 && "is-open")}>
                        <dt>Amount due</dt>
                        <dd>{fmt(amountDue)}</dd>
                      </div>
                    </>
                  ) : null}
                </dl>
              </div>
            </Card>

            {invoice.notes?.trim() ? (
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Terms &amp; notes
                  </Text>
                  <p className="qv-terms">{invoice.notes}</p>
                </BlockStack>
              </Card>
            ) : null}

            {!isDraft ? (
              <Card padding="0">
                <div className="qv-card-head">
                  <Text as="h2" variant="headingMd">
                    Accounting entries
                  </Text>
                  <Text as="span" tone="subdued" variant="bodySm">
                    Customer invoices journal
                  </Text>
                </div>
                {journalLoading ? (
                  <div className="iv-journal-empty">
                    <SkeletonBodyText lines={3} />
                  </div>
                ) : journalLines.length === 0 ? (
                  <div className="iv-journal-empty">
                    <Text as="p" tone="subdued">
                      No journal entries yet.
                    </Text>
                  </div>
                ) : (
                  <div className="iv-journal">
                    <div className="iv-journal__head">
                      <span>Account</span>
                      <span>Label</span>
                      <span>Debit</span>
                      <span>Credit</span>
                    </div>
                    {journalLines.map((line) => (
                      <div className="iv-journal__row" key={line.id}>
                        <span>
                          <strong>{line.accountCode}</strong> {line.accountName}
                        </span>
                        <span className="is-muted">{line.label}</span>
                        <span className={line.debit > 0 ? "is-num" : "is-num is-zero"}>{line.debit > 0 ? fmt(line.debit) : "—"}</span>
                        <span className={line.credit > 0 ? "is-num" : "is-num is-zero"}>{line.credit > 0 ? fmt(line.credit) : "—"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ) : null}

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Activity
                </Text>
                {activities.length === 0 ? (
                  <Text as="p" tone="subdued">
                    Nothing yet — posting, payments and emails will show up here.
                  </Text>
                ) : (
                  <ol className="qv-timeline">
                    {activities.map((act) => (
                      <li className={`is-${act.activityType === "paid" || act.activityType === "payment" ? "confirmed" : act.activityType}`} key={act.id}>
                        <span className="qv-timeline__icon">
                          <Icon source={INVOICE_ACTIVITY_ICON[act.activityType] ?? (/payment|paid/i.test(act.message) ? CheckCircleIcon : /posted/i.test(act.message) ? ReceiptIcon : /email|sent/i.test(act.message) ? EmailIcon : /cancel/i.test(act.message) ? XCircleIcon : NoteIcon)} />
                        </span>
                        <div>
                          <strong>{act.message}</strong>
                          <small>{shortDateTime(act.createdAt)}</small>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </BlockStack>
            </Card>
          </div>

          <div className="qv-side">
            {isPosted ? (
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Payment
                    </Text>
                    <Badge tone={isPaid ? "success" : overdue ? "critical" : "attention"}>
                      {isPaid ? "Paid" : overdue ? "Overdue" : amountPaid > 0 ? "Part paid" : "Unpaid"}
                    </Badge>
                  </InlineStack>
                  <div className={cn("iv-paybox", isPaid && "is-done", overdue && "is-late")}>
                    <div className="iv-paybox__nums">
                      <span>
                        <small>Paid</small>
                        <strong>{fmt(amountPaid)}</strong>
                      </span>
                      <span>
                        <small>Due</small>
                        <strong>{fmt(amountDue)}</strong>
                      </span>
                    </div>
                    <i>
                      <b style={{ width: `${paidShare}%` }} />
                    </i>
                    <small>{Math.round(paidShare)}% of {fmt(invoice.amountTotal)} collected</small>
                  </div>
                  {canPay ? (
                    <Button fullWidth variant="primary" onClick={() => setPaymentModalOpen(true)}>
                      Record payment
                    </Button>
                  ) : null}
                </BlockStack>
              </Card>
            ) : null}

            {isCancelled && invoice.creditNote ? (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Credit note
                  </Text>
                  <dl className="qv-facts">
                    <div>
                      <dt>Number</dt>
                      <dd>{invoice.creditNote.number}</dd>
                    </div>
                    <div>
                      <dt>Reason</dt>
                      <dd>{invoice.creditNote.reason || "—"}</dd>
                    </div>
                    <div>
                      <dt>Refund due</dt>
                      <dd>{fmt(invoice.creditNote.refundDue)}</dd>
                    </div>
                    <div>
                      <dt>Refunded</dt>
                      <dd>{fmt(invoice.creditNote.refundPaid)}</dd>
                    </div>
                  </dl>
                  {refundOutstanding > 0 ? (
                    <Button
                      fullWidth
                      variant="primary"
                      onClick={() => {
                        setRefundAmount(String(refundOutstanding));
                        setRefundOpen(true);
                      }}
                    >
                      Record refund
                    </Button>
                  ) : null}
                </BlockStack>
              </Card>
            ) : null}

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Details
                  </Text>
                  {!isCancelled ? (
                    <Button size="slim" variant="plain" onClick={() => setEditDetailsOpen(true)}>
                      Edit
                    </Button>
                  ) : null}
                </InlineStack>
                <dl className="qv-facts">
                  <div>
                    <dt>Document</dt>
                    <dd>{invoiceBillingLabel}</dd>
                  </div>
                  <div>
                    <dt>Payment term</dt>
                    <dd>{invoice.paymentTerm || "—"}</dd>
                  </div>
                  <div>
                    <dt>Internal ref</dt>
                    <dd>{invoice.internalReference || "—"}</dd>
                  </div>
                  <div>
                    <dt>Payment ref</dt>
                    <dd>{invoice.number}</dd>
                  </div>
                </dl>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Bank shown on the PDF
                </Text>
                {isCancelled ? (
                  <Text as="p" tone="subdued" variant="bodySm">
                    Locked on cancelled invoices.
                  </Text>
                ) : (
                  <>
                    <Select
                      disabled={savingDocumentBank || invoiceBankCandidates.length === 0}
                      helpText={`Only ${invoice.currencyCode ?? "matching"} accounts can be used.`}
                      label="Bank account"
                      labelHidden
                      options={[
                        ...(invoiceBankCandidates.length > 1 && !invoice.documentBankAccountId
                          ? [{ label: "Choose a bank account…", value: "", disabled: true }]
                          : []),
                        ...invoiceBankCandidates.map((account) => ({
                          label: `${account.name} (${account.currencyCode})`,
                          value: account.id,
                        })),
                      ]}
                      value={invoice.documentBankAccountId ?? ""}
                      onChange={(value) => {
                        if (value) void handleSaveDocumentBank(value);
                      }}
                    />
                    {invoiceBankCandidates.length === 0 ? (
                      <Banner tone="warning">
                        No {invoice.currencyCode ?? "matching"} bank account is set up for documents.{" "}
                        <Link url="/dashboard/settings/bank-accounts">Add one</Link>
                      </Banner>
                    ) : null}
                  </>
                )}
              </BlockStack>
            </Card>
          </div>
        </div>
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
          dueDate: invoice.dueDate ? formatAppDate(invoice.dueDate) : "",
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

      <InvoiceDocumentBankModal
        open={bankModalOpen}
        onClose={() => setBankModalOpen(false)}
        currencyCode={invoice.currencyCode ?? "AED"}
        bankAccounts={bankAccounts}
        status={getInvoicePaymentBankStatus(
          bankAccounts,
          invoice.currencyCode ?? "AED",
          invoice.documentBankAccountId,
        )}
        initialBankAccountId={invoice.documentBankAccountId}
        saving={savingDocumentBank}
        onConfirm={handleSaveDocumentBank}
        onBankAccountCreated={(account) =>
          setBankAccounts((prev) => [...prev, account])
        }
      />

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

      <EditInvoiceDetailsModal
        invoice={invoice}
        open={editDetailsOpen}
        onClose={() => setEditDetailsOpen(false)}
        onSuccess={(updated) => {
          const numberChanged = updated.number !== invoice.number;
          setInvoice(updated);
          setSuccessBanner(
            numberChanged
              ? `Invoice number changed from ${invoice.number} to ${updated.number}.`
              : `Invoice ${updated.number} details updated successfully.`,
          );
        }}
      />
    </AppPage>
  );
}
