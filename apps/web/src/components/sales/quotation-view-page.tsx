"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  DropZone,
  EmptyState,
  Icon,
  InlineStack,
  Link,
  Modal,
  SkeletonBodyText,
  Text,
  TextField,
  type IconSource,
} from "@shopify/polaris";
import {
  AttachmentIcon,
  CheckCircleIcon,
  CheckIcon,
  EditIcon,
  LockIcon,
  NoteIcon,
  ReceiptIcon,
  SendIcon,
  XCircleIcon,
} from "@shopify/polaris-icons";
import { useRouter, useSearchParams } from "next/navigation";
import { billingQuotationTypeLabel, groupSerializedLines, sumDocumentAmounts } from "@frog1/shared";
import { useEffect, useMemo, useState } from "react";
import { SendDocumentEmailModal } from "@/components/documents/send-document-email-modal";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { AppPage } from "@/components/layout/page";
import { formatMoney } from "@/components/sales/format-money";
import { LineItemDescription } from "@/components/sales/line-item-description";
import { DealThreadPanel } from "@/components/sales/deal-thread-panel";
import { useToast } from "@/components/providers/toast-provider";
import { formatAppDate } from "@/lib/format-date";
import { formatQuantity } from "@/lib/format-quantity";
import { copyText } from "@/lib/clipboard";
import { formatDiscountLabel, resolveDeliveryFee } from "@/lib/line-item-utils";
import { listCurrencies, type Currency } from "@/lib/currencies-api";
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
import { cn } from "@/lib/utils";

interface QuotationViewPageProps {
  quotationId: string;
}

const STEPS = [
  { key: "draft", label: "Draft", activity: ["created"] },
  { key: "sent", label: "Sent", activity: ["sent"] },
  { key: "signed", label: "Signed", activity: ["signed"] },
  { key: "confirmed", label: "Order", activity: ["confirmed"] },
  { key: "invoiced", label: "Invoiced", activity: ["invoiced"] },
] as const;

function stepIndex(q: Quotation) {
  if (q.invoiceStatus === "invoiced") return 4;
  if (q.state === "confirmed") return 3;
  if (q.state === "signed") return 2;
  if (q.state === "sent") return 1;
  return 0;
}

const STATE_META: Record<Quotation["state"], { label: string; tone?: "success" | "info" | "attention" | "critical" }> = {
  draft: { label: "Draft" },
  sent: { label: "Sent", tone: "info" },
  signed: { label: "Signed", tone: "attention" },
  confirmed: { label: "Sales order", tone: "success" },
  cancelled: { label: "Cancelled", tone: "critical" },
};

const ACTIVITY_ICON: Record<string, IconSource> = {
  created: NoteIcon,
  sent: SendIcon,
  signed: EditIcon,
  confirmed: CheckCircleIcon,
  cancelled: XCircleIcon,
  invoiced: ReceiptIcon,
};

function daysUntil(date: string | null) {
  if (!date) return null;
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
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
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
  const [copyLoading, setCopyLoading] = useState(false);

  const [pdfOpen, setPdfOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const [notesDraft, setNotesDraft] = useState("");
  const [notesEditing, setNotesEditing] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [poUploading, setPoUploading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [result, currencies] = await Promise.all([getQuotation(quotationId), listCurrencies()]);
        setQuotation(result);
        setCurrency(currencies.find((c) => c.id === result.currencyId) ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load quotation");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [quotationId]);

  const lines = useMemo(() => quotation?.lines ?? [], [quotation?.lines]);
  const displayLines = useMemo(() => groupSerializedLines(lines), [lines]);
  const currencyCode = currency?.code ?? "USD";
  const decimals = currency?.decimalPlaces ?? 2;
  const money = (value: string | number) => formatMoney(value, currencyCode, decimals);

  const lineNet = useMemo(() => lines.reduce((s, l) => s + Number(l.priceSubtotal ?? 0), 0), [lines]);
  const lineGross = useMemo(() => lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitPrice), 0), [lines]);
  const discount = Math.max(0, lineGross - lineNet);
  const discountPct = lineGross > 0 ? Number(((discount / lineGross) * 100).toFixed(2)) : 0;
  const deliveryFee = useMemo(
    () => resolveDeliveryFee(lineNet, quotation?.deliveryFeeAmount, quotation?.deliveryFeePercent),
    [lineNet, quotation?.deliveryFeeAmount, quotation?.deliveryFeePercent],
  );
  const totals = useMemo(() => {
    if (!lines.length) return null;
    return sumDocumentAmounts(
      lines.map((l) => ({
        priceSubtotal: Number(l.priceSubtotal ?? 0),
        priceTax: Number(l.priceTax ?? 0),
        priceTotal: Number(l.priceTotal ?? 0),
      })),
      1,
      quotation?.deliveryFeeAmount,
      quotation?.deliveryFeePercent,
    );
  }, [lines, quotation?.deliveryFeeAmount, quotation?.deliveryFeePercent]);
  const amountUntaxed = String(totals?.amountUntaxed ?? quotation?.amountUntaxed ?? 0);
  const amountTax = String(totals?.amountTax ?? quotation?.amountTax ?? 0);
  const amountTotal = String(totals?.amountTotal ?? quotation?.amountTotal ?? 0);

  // ── Actions ─────────────────────────────────────────────────
  async function run(action: () => Promise<Quotation>, success: string, failure: string) {
    setActionLoading(true);
    try {
      setQuotation(await action());
      showSuccess(success);
    } catch (err) {
      const message = err instanceof Error ? err.message : failure;
      setError(message);
      showError(message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCopySigningLink() {
    if (!quotation) return;
    setCopyLoading(true);
    try {
      const { url } = await getQuotationSigningUrl(quotation.id);
      await copyText(url);
      showSuccess("Signing link copied — paste it into any message to the customer.");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to copy signing link");
    } finally {
      setCopyLoading(false);
    }
  }

  async function handleSendEmail(input: { recipientEmail: string; subject: string; body: string }) {
    if (!quotation) return;
    setEmailSending(true);
    try {
      await sendQuotationEmail(quotation.id, input.recipientEmail, input.subject, input.body);
      setNotice(`Sent to ${input.recipientEmail}. The quotation is now marked as sent.`);
      setEmailOpen(false);
      setQuotation(await getQuotation(quotation.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setEmailSending(false);
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

  async function saveNotes() {
    if (!quotation) return;
    setNotesSaving(true);
    try {
      setQuotation(await updateQuotationInternalNotes(quotation.id, notesDraft));
      setNotesEditing(false);
      showSuccess("Team notes saved");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save notes");
    } finally {
      setNotesSaving(false);
    }
  }

  async function uploadPo(files: File[]) {
    const file = files[0];
    if (!file || !quotation) return;
    setPoUploading(true);
    try {
      setQuotation(await uploadCustomerPoDocument(quotation.id, file));
      showSuccess(`Attached ${file.name}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to upload PO document");
    } finally {
      setPoUploading(false);
    }
  }

  if (loading) {
    return (
      <AppPage backAction={{ content: "Quotations", url: "/dashboard/sales/quotations" }} title="Quotation">
        <Card>
          <SkeletonBodyText lines={10} />
        </Card>
      </AppPage>
    );
  }

  if (!quotation) {
    return (
      <AppPage backAction={{ content: "Quotations", url: "/dashboard/sales/quotations" }} title="Quotation">
        <Banner tone="critical">{error || "Quotation not found"}</Banner>
      </AppPage>
    );
  }

  const q = quotation;
  const state = q.state;
  const isCancelled = state === "cancelled";
  const isConfirmed = state === "confirmed";
  const canEdit = state === "draft" || state === "sent";
  const canShareLink = !isCancelled && !isConfirmed;
  const current = stepIndex(q);
  const docLabel = isConfirmed ? "Sales order" : "Quotation";
  const name = q.customerName ?? "Customer";
  const validDays = state === "draft" || state === "sent" ? daysUntil(q.validityDate) : null;
  const activities = [...(q.activities ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const stepDate = (keys: readonly string[]) => {
    const match = (q.activities ?? []).find((a) => keys.includes(a.activityType));
    return match ? shortDateTime(match.createdAt) : null;
  };

  // What should happen next, in plain words.
  const next = (() => {
    if (isCancelled) {
      return {
        tone: "critical" as const,
        title: "This quotation was cancelled",
        text: "It can no longer be sent or confirmed. Revise it from the deal thread, or delete it.",
        action: { label: "Delete quotation", onClick: () => setDeleteOpen(true), destructive: true },
      };
    }
    if (q.invoiceStatus === "invoiced") {
      return { tone: "done" as const, title: "Invoiced", text: "This order has been invoiced. Nothing else to do here.", action: null };
    }
    if (isConfirmed) {
      return {
        tone: "go" as const,
        title: "Ready to invoice",
        text: "The customer's order is confirmed. Create the invoice to bill them.",
        action: { label: "Create invoice", onClick: () => router.push(`/dashboard/invoices/new?quotationId=${q.id}`) },
      };
    }
    if (state === "signed") {
      return {
        tone: "go" as const,
        title: `${q.signedBy ?? name} signed this quote`,
        text: `Signed ${q.signedOn ? shortDateTime(q.signedOn) : "recently"}. Confirm it as a sales order to start delivery and invoicing.`,
        action: { label: "Confirm sales order", onClick: () => void run(() => confirmQuotation(q.id), `${q.number} confirmed as a sales order.`, "Failed to confirm") },
      };
    }
    if (state === "sent") {
      return {
        tone: validDays !== null && validDays < 0 ? ("warn" as const) : ("wait" as const),
        title: validDays !== null && validDays < 0 ? "Expired without a reply" : "Waiting for the customer",
        text:
          validDays !== null && validDays < 0
            ? `The quote expired ${Math.abs(validDays)} days ago. Revise it or send a reminder.`
            : "They can sign online from the link in your email. Confirm manually if they approved another way.",
        action: { label: "Confirm sales order", onClick: () => void run(() => confirmQuotation(q.id), `${q.number} confirmed as a sales order.`, "Failed to confirm") },
      };
    }
    return {
      tone: "wait" as const,
      title: "Draft — not sent yet",
      text: "Check the lines below, then send it to the customer for signature.",
      action: { label: "Send to customer", onClick: () => setEmailOpen(true) },
    };
  })();

  const secondaryActions = [
    ...(canEdit ? [{ content: "Edit", onAction: () => router.push(`/dashboard/sales/quotations/${q.id}/edit`) }] : []),
    { content: "Preview PDF", onAction: () => setPdfOpen(true) },
    ...(!isCancelled && state !== "draft" ? [{ content: "Send again", onAction: () => setEmailOpen(true) }] : []),
  ];

  const moreActions = [
    ...(state === "draft"
      ? [{ content: "Mark as sent (sent another way)", onAction: () => void run(() => markQuotationSent(q.id), "Marked as sent.", "Failed to mark as sent") }]
      : []),
    ...(canShareLink ? [{ content: "Copy signing link", onAction: () => void handleCopySigningLink() }] : []),
    ...(!isCancelled ? [{ content: `Cancel ${docLabel.toLowerCase()}`, destructive: true, onAction: () => setCancelOpen(true) }] : []),
    ...(isCancelled ? [{ content: "Delete", destructive: true, onAction: () => setDeleteOpen(true) }] : []),
  ];

  return (
    <AppPage
      backAction={{ content: "Quotations", url: "/dashboard/sales/quotations" }}
      primaryAction={
        next.action && !("destructive" in next.action)
          ? { content: next.action.label, loading: actionLoading, onAction: next.action.onClick }
          : undefined
      }
      secondaryActions={secondaryActions}
      actionGroups={moreActions.length ? [{ title: "More", actions: moreActions }] : undefined}
      subtitle={`${name} · ${billingQuotationTypeLabel(q.billingDocumentType ?? "tax_invoice")}`}
      title={`${docLabel} ${q.number}`}
      titleMetadata={<Badge tone={STATE_META[state].tone}>{STATE_META[state].label}</Badge>}
    >
      <BlockStack gap="400">
        {createdDraft ? (
          <Banner tone="success" onDismiss={() => router.replace(`/dashboard/sales/quotations/${q.id}`)}>
            Draft saved. Send it to the customer when you&apos;re ready — you can confirm it once they approve.
          </Banner>
        ) : null}
        {notice ? (
          <Banner tone="success" onDismiss={() => setNotice(null)}>
            {notice}
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
              <span className="qv-hero__avatar">{initials(name)}</span>
              <div>
                <span className="qv-hero__label">{docLabel} for</span>
                <strong>{name}</strong>
                {q.customerEmail ? <small>{q.customerEmail}</small> : null}
              </div>
            </div>
            <div className="qv-hero__total">
              <span className="qv-hero__label">Total</span>
              <strong>{money(amountTotal)}</strong>
              <small>
                {money(amountUntaxed)} + {money(amountTax)} tax
              </small>
            </div>
          </div>

          <div className="qv-hero__facts">
            <div>
              <span>Quote date</span>
              <strong>{formatAppDate(q.quoteDate)}</strong>
            </div>
            <div className={cn(validDays !== null && validDays < 0 && !isConfirmed && "is-bad", validDays !== null && validDays >= 0 && validDays <= 7 && "is-warn")}>
              <span>Valid until</span>
              <strong>{q.validityDate ? formatAppDate(q.validityDate) : "—"}</strong>
              {validDays !== null && !isConfirmed && !isCancelled ? (
                <small>{validDays < 0 ? `expired ${Math.abs(validDays)}d ago` : validDays === 0 ? "expires today" : `${validDays} days left`}</small>
              ) : null}
            </div>
            <div>
              <span>Customer ref / PO</span>
              <strong>{q.customerReference || "—"}</strong>
            </div>
            <div>
              <span>Currency</span>
              <strong>{currency ? currency.code : currencyCode}</strong>
            </div>
          </div>

          <ol className={cn("qv-steps", isCancelled && "is-cancelled")}>
            {STEPS.map((step, i) => {
              const done = !isCancelled && i < current;
              const now = !isCancelled && i === current;
              const date = i <= current ? stepDate(step.activity) : null;
              return (
                <li className={cn(done && "is-done", now && "is-now")} key={step.key}>
                  <span className="qv-steps__dot">{done ? <Icon source={CheckIcon} /> : i + 1}</span>
                  <span className="qv-steps__text">
                    <strong>{step.label}</strong>
                    <small>{date ?? (now ? "current" : "")}</small>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Next step */}
        <div className={cn("qv-next", `is-${next.tone}`)}>
          <div>
            <strong>{next.title}</strong>
            <span>{next.text}</span>
          </div>
          {next.action ? (
            <Button
              loading={actionLoading}
              tone={"destructive" in next.action ? "critical" : undefined}
              variant="primary"
              onClick={next.action.onClick}
            >
              {next.action.label}
            </Button>
          ) : null}
        </div>

        <div className="qv-layout">
          {/* Main column */}
          <div className="qv-main">
            <Card padding="0">
              <div className="qv-card-head">
                <Text as="h2" variant="headingMd">
                  Items
                </Text>
                <Text as="span" tone="subdued" variant="bodySm">
                  {lines.length} line{lines.length === 1 ? "" : "s"}
                </Text>
              </div>
              {lines.length === 0 ? (
                <EmptyState
                  action={canEdit ? { content: "Add items", onAction: () => router.push(`/dashboard/sales/quotations/${q.id}/edit`) } : undefined}
                  heading="No items yet"
                  image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
                >
                  <p>Add products or services to build this quotation.</p>
                </EmptyState>
              ) : (
                <div className="qv-lines">
                  <div className="qv-lines__head">
                    <span>Item</span>
                    <span>Qty</span>
                    <span>Unit price</span>
                    <span>Discount</span>
                    <span>Tax</span>
                    <span>Amount</span>
                  </div>
                  {displayLines.map((line) => (
                    <div className="qv-lines__row" key={line.id}>
                      <div className="qv-lines__item">
                        <LineItemDescription details={line.productDescription} productId={line.productId} title={line.description} />
                        {line.serialNumbers.length > 0 ? (
                          <small>
                            SN{" "}
                            {line.sourceLines.map((source, index) => (
                              <span key={source.id}>
                                {index > 0 ? ", " : ""}
                                {source.productUnitId ? (
                                  <Link url={`/dashboard/inventory/units/${source.productUnitId}`}>{source.serialNumber}</Link>
                                ) : (
                                  source.serialNumber
                                )}
                              </span>
                            ))}
                          </small>
                        ) : line.productUnitId ? (
                          <small>Serial-tracked item</small>
                        ) : null}
                      </div>
                      <span className="qv-num" data-label="Qty">{formatQuantity(line.quantity)}</span>
                      <span className="qv-num" data-label="Unit price">{money(line.unitPrice)}</span>
                      <span className="qv-num is-muted" data-label="Discount">
                        {formatDiscountLabel(line.discountAmount, line.discountPercent, currencyCode)}
                      </span>
                      <span className="qv-num is-muted" data-label="Tax">{line.taxRatePercent}%</span>
                      <span className="qv-num is-strong" data-label="Amount">
                        {money(Number(line.quantity) * Number(line.unitPrice))}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="qv-totals">
                <dl>
                  {discount > 0 ? (
                    <>
                      <div>
                        <dt>Subtotal before discount</dt>
                        <dd>{money(lineGross)}</dd>
                      </div>
                      <div className="is-good">
                        <dt>Discount ({discountPct}%)</dt>
                        <dd>−{money(discount)}</dd>
                      </div>
                    </>
                  ) : null}
                  {deliveryFee > 0 ? (
                    <>
                      <div>
                        <dt>Items</dt>
                        <dd>{money(lineNet)}</dd>
                      </div>
                      <div>
                        <dt>Shipping{q.deliveryFeePercent ? ` (${q.deliveryFeePercent}%)` : ""}</dt>
                        <dd>+{money(deliveryFee)}</dd>
                      </div>
                    </>
                  ) : (
                    <div>
                      <dt>Subtotal</dt>
                      <dd>{money(amountUntaxed)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Tax</dt>
                    <dd>+{money(amountTax)}</dd>
                  </div>
                  <div className="is-total">
                    <dt>Total</dt>
                    <dd>{money(amountTotal)}</dd>
                  </div>
                </dl>
              </div>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Terms &amp; notes for the customer
                </Text>
                {q.notes?.trim() ? (
                  <p className="qv-terms">{q.notes}</p>
                ) : (
                  <Text as="p" tone="subdued">
                    No terms or notes on this quotation.
                    {canEdit ? " Add them from Edit." : ""}
                  </Text>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Activity
                </Text>
                {activities.length === 0 ? (
                  <Text as="p" tone="subdued">
                    Nothing yet — sending, signing and confirming will show up here.
                  </Text>
                ) : (
                  <ol className="qv-timeline">
                    {activities.map((act: QuotationActivity) => (
                      <li className={`is-${act.activityType}`} key={act.id}>
                        <span className="qv-timeline__icon">
                          <Icon source={ACTIVITY_ICON[act.activityType] ?? NoteIcon} />
                        </span>
                        <div>
                          <strong>{act.message}</strong>
                          <small>
                            {shortDateTime(act.createdAt)}
                            {act.performedBy ? ` · ${act.performedBy}` : ""}
                          </small>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </BlockStack>
            </Card>
          </div>

          {/* Side column */}
          <div className="qv-side">
            {q.signedBy || state === "signed" ? (
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Customer approval
                    </Text>
                    <Badge tone="success">Signed</Badge>
                  </InlineStack>
                  {q.signatureImage ? (
                    <div className="qv-signature">
                      <img alt={`Signature of ${q.signedBy ?? "customer"}`} src={q.signatureImage} />
                    </div>
                  ) : null}
                  <dl className="qv-facts">
                    <div>
                      <dt>Signed by</dt>
                      <dd>{q.signedBy ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>When</dt>
                      <dd>{q.signedOn ? shortDateTime(q.signedOn) : "—"}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{q.signedEmail ?? q.customerEmail ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Approved total</dt>
                      <dd>{money(q.amountTotal)}</dd>
                    </div>
                  </dl>
                  <InlineStack gap="200">
                    <Button onClick={() => setPdfOpen(true)}>Signed PDF</Button>
                    {q.accessToken ? (
                      <Button
                        variant="plain"
                        onClick={() =>
                          window.open(`${window.location.origin}/quotations/public/${q.accessToken}`, "_blank", "noopener,noreferrer")
                        }
                      >
                        Approval page
                      </Button>
                    ) : null}
                  </InlineStack>
                </BlockStack>
              </Card>
            ) : canShareLink ? (
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Online signature
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    The customer can review and sign this quote from a secure link — no account needed.
                  </Text>
                  <Button loading={copyLoading} onClick={() => void handleCopySigningLink()}>
                    Copy signing link
                  </Button>
                </BlockStack>
              </Card>
            ) : null}

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Details
                </Text>
                <dl className="qv-facts">
                  <div>
                    <dt>Document type</dt>
                    <dd>{billingQuotationTypeLabel(q.billingDocumentType ?? "tax_invoice")}</dd>
                  </div>
                  <div>
                    <dt>Currency</dt>
                    <dd>{currency ? `${currency.code} · ${currency.name}` : currencyCode}</dd>
                  </div>
                  <div>
                    <dt>Internal ref</dt>
                    <dd>{q.internalReference || "—"}</dd>
                  </div>
                  <div>
                    <dt>Payment ref</dt>
                    <dd>{q.paymentReference || "—"}</dd>
                  </div>
                  <div>
                    <dt>Invoicing</dt>
                    <dd>
                      {q.invoiceStatus === "invoiced"
                        ? "Invoiced"
                        : q.invoiceStatus === "partial"
                          ? "Partly invoiced"
                          : q.invoiceStatus === "to_invoice"
                            ? "Ready to invoice"
                            : "Not yet"}
                    </dd>
                  </div>
                </dl>
                <div className="qv-po">
                  <Text as="span" fontWeight="semibold" variant="bodySm">
                    Customer PO document
                  </Text>
                  {q.customerPoDocumentUrl ? (
                    <a className="qv-po__file" href={`/api/v1/files/${q.customerPoDocumentUrl}`} rel="noreferrer" target="_blank">
                      <Icon source={AttachmentIcon} />
                      View attached PO
                    </a>
                  ) : null}
                  <DropZone
                    accept="application/pdf,image/*"
                    allowMultiple={false}
                    disabled={poUploading}
                    outline
                    variableHeight
                    onDropAccepted={(files) => void uploadPo(files)}
                  >
                    <div className="qv-po__drop">
                      {poUploading ? "Uploading…" : q.customerPoDocumentUrl ? "Replace PO (PDF or image)" : "Drop the customer's PO here, or click to upload"}
                    </div>
                  </DropZone>
                </div>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="150" blockAlign="center">
                    <Icon source={LockIcon} tone="subdued" />
                    <Text as="h2" variant="headingMd">
                      Team notes
                    </Text>
                  </InlineStack>
                  {!notesEditing ? (
                    <Button
                      size="slim"
                      variant="plain"
                      onClick={() => {
                        setNotesDraft(q.internalNotes || "");
                        setNotesEditing(true);
                      }}
                    >
                      {q.internalNotes ? "Edit" : "Add note"}
                    </Button>
                  ) : null}
                </InlineStack>
                {notesEditing ? (
                  <BlockStack gap="200">
                    <TextField
                      autoComplete="off"
                      autoFocus
                      helpText="Only your team sees this — never printed or sent."
                      label="Team notes"
                      labelHidden
                      multiline={5}
                      placeholder="e.g. Customer asked for delivery after the 20th."
                      value={notesDraft}
                      onChange={setNotesDraft}
                    />
                    <InlineStack gap="200" align="end">
                      <Button onClick={() => setNotesEditing(false)}>Cancel</Button>
                      <Button loading={notesSaving} variant="primary" onClick={() => void saveNotes()}>
                        Save
                      </Button>
                    </InlineStack>
                  </BlockStack>
                ) : q.internalNotes ? (
                  <p className="qv-note">{q.internalNotes}</p>
                ) : (
                  <Text as="p" tone="subdued" variant="bodySm">
                    Private notes for your team. Never shown to the customer.
                  </Text>
                )}
              </BlockStack>
            </Card>

            <DealThreadPanel quotation={q} onUpdated={(updated) => setQuotation(updated)} />
          </div>
        </div>
      </BlockStack>

      <DocumentPreviewModal
        open={pdfOpen}
        quotationId={q.id}
        quotationNumber={q.number}
        title={`${docLabel} ${q.number}`}
        onClose={() => setPdfOpen(false)}
      />

      <SendDocumentEmailModal
        documentType="quotation"
        loading={emailSending}
        open={emailOpen}
        pdfLabel={`quotation-${q.number}.pdf`}
        placeholders={{ number: q.number, customerName: name, companyName: "", total: money(amountTotal) }}
        primaryActionLabel="Send quotation"
        recipient={q.customerEmail ?? ""}
        title={`Send ${q.number} to ${name}`}
        onClose={() => setEmailOpen(false)}
        onSend={handleSendEmail}
      />

      <Modal
        open={cancelOpen}
        primaryAction={{
          content: `Cancel ${docLabel.toLowerCase()}`,
          destructive: true,
          loading: actionLoading,
          onAction: async () => {
            await run(() => cancelQuotation(q.id), `${q.number} cancelled.`, "Failed to cancel");
            setCancelOpen(false);
          },
        }}
        secondaryActions={[{ content: "Keep it", onAction: () => setCancelOpen(false) }]}
        title={`Cancel ${q.number}?`}
        onClose={() => setCancelOpen(false)}
      >
        <Modal.Section>
          <Text as="p">
            The customer will no longer be able to sign it, and it won&apos;t count in your pipeline. You can still revise it
            into a new quote afterwards.
          </Text>
        </Modal.Section>
      </Modal>

      <Modal
        open={deleteOpen}
        primaryAction={{ content: "Delete", destructive: true, loading: actionLoading, onAction: () => void handleDelete() }}
        secondaryActions={[{ content: "Keep it", onAction: () => setDeleteOpen(false) }]}
        title={`Delete ${q.number}?`}
        onClose={() => setDeleteOpen(false)}
      >
        <Modal.Section>
          <Text as="p">
            This removes the cancelled quotation from your lists. Its document number and history stay on record.
          </Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
