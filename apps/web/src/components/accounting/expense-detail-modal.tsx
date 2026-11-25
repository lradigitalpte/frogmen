"use client";

import { Badge, Banner, Button, Icon, Modal, SkeletonBodyText, SkeletonDisplayText, type IconSource } from "@shopify/polaris";
import {
  BankIcon,
  CalendarIcon,
  CashDollarIcon,
  CheckCircleIcon,
  CreditCardIcon,
  HashtagIcon,
  NoteIcon,
  PersonIcon,
  ReceiptIcon,
  CategoriesIcon,
} from "@shopify/polaris-icons";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { getExpense, getExpenseReceiptUrl, type ExpenseDetail } from "@/lib/expenses-api";
import { formatAppDate, formatAppDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";

function paymentMethodLabel(detail: ExpenseDetail) {
  switch (detail.paymentMethod) {
    case "cash":
      return "Cash";
    case "cheque":
      return "Cheque";
    case "bank_transfer":
      return "Bank transfer";
    case "wire_transfer":
      return "Wire transfer";
    case "custom":
      return detail.paymentSourceLabel ?? "Company card / other";
    default:
      return detail.paymentMethod.replace(/_/g, " ");
  }
}

function paidFrom(detail: ExpenseDetail) {
  if (detail.paymentSource === "cash") return "Petty cash · 101501";
  return detail.bankAccountName ?? detail.paymentSourceLabel ?? "Bank account";
}

function methodIcon(detail: ExpenseDetail): IconSource {
  if (detail.paymentSource === "cash") return CashDollarIcon;
  if (detail.paymentMethod === "custom") return CreditCardIcon;
  return BankIcon;
}

function Fact({ icon, label, children }: { icon: IconSource; label: string; children: ReactNode }) {
  return (
    <div className="xd-fact">
      <span className="xd-fact__icon">
        <Icon source={icon} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{children}</strong>
      </div>
    </div>
  );
}

interface ExpenseDetailModalProps {
  expenseId: string | null;
  onClose: () => void;
  onEdit?: (detail: ExpenseDetail) => void;
}

export function ExpenseDetailModal({ expenseId, onClose, onEdit }: ExpenseDetailModalProps) {
  const { formatBaseMoney } = useOrgCurrency();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExpenseDetail | null>(null);

  useEffect(() => {
    if (!expenseId) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getExpense(expenseId)
      .then((row) => {
        if (!cancelled) setDetail(row);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load expense");
          setDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  const claim = detail?.source === "reimbursement";
  const r = detail?.reimbursement ?? null;
  const showRef = detail?.reference?.trim() && detail.reference !== detail.number && detail.reference !== r?.claimNumber;
  const debits = detail?.journal?.lines.filter((l) => l.debit > 0) ?? [];
  const credits = detail?.journal?.lines.filter((l) => l.credit > 0) ?? [];
  const debitTotal = debits.reduce((s, l) => s + l.debit, 0);
  const creditTotal = credits.reduce((s, l) => s + l.credit, 0);
  const balanced = Math.abs(debitTotal - creditTotal) < 0.005;

  return (
    <Modal
      open={Boolean(expenseId)}
      primaryAction={
        detail && detail.source === "manual" && onEdit
          ? {
              content: "Edit expense",
              onAction: () => {
                onEdit(detail);
                onClose();
              },
            }
          : claim
            ? { content: "Open staff claims", url: "/dashboard/accounting/expense-reimbursements" }
            : undefined
      }
      secondaryActions={[{ content: "Close", onAction: onClose }]}
      title={detail ? `Expense ${detail.number}` : "Expense"}
      onClose={onClose}
    >
      <Modal.Section>
        {error ? <Banner tone="critical">{error}</Banner> : null}

        {loading || (!detail && !error) ? (
          <div className="xd">
            <div className="xd-hero">
              <SkeletonDisplayText size="medium" />
            </div>
            <SkeletonBodyText lines={6} />
          </div>
        ) : null}

        {detail && !loading ? (
          <div className="xd">
            {/* Hero */}
            <div className="xd-hero">
              <div className="xd-hero__main">
                <span className="xd-hero__label">{claim ? "Staff reimbursement" : "Company expense"}</span>
                <strong>{formatBaseMoney(detail.amount)}</strong>
                <p>{detail.description}</p>
              </div>
              <div className="xd-hero__badges">
                {detail.journal?.state === "posted" ? (
                  <span className="xd-posted">
                    <Icon source={CheckCircleIcon} /> Posted
                  </span>
                ) : (
                  <Badge tone="attention">Not posted</Badge>
                )}
                <span className="xd-hero__date">{formatAppDate(detail.expenseDate)}</span>
              </div>
            </div>

            {/* Facts */}
            <div className="xd-facts">
              <Fact icon={methodIcon(detail)} label="Paid with">
                {paymentMethodLabel(detail)}
                <small>{paidFrom(detail)}</small>
              </Fact>
              <Fact icon={CategoriesIcon} label="Category">
                {detail.categoryName ?? <span className="xd-muted">Not categorised</span>}
              </Fact>
              <Fact icon={CalendarIcon} label="Expense date">
                {formatAppDate(detail.expenseDate)}
              </Fact>
              <Fact icon={HashtagIcon} label={showRef ? "Reference" : "Number"}>
                {showRef ? detail.reference : detail.number}
              </Fact>
            </div>

            {/* Who */}
            <section className="xd-block">
              <h3>{claim ? "Claim history" : "Recorded"}</h3>
              {claim && r ? (
                <ol className="xd-timeline">
                  <li>
                    <span className="xd-timeline__dot" />
                    <div>
                      <strong>
                        Submitted by {r.submitterName ?? r.submitterEmail ?? "a team member"}
                        {r.claimNumber ? <em>{r.claimNumber}</em> : null}
                      </strong>
                      <small>{r.submittedAt ? formatAppDateTime(r.submittedAt) : "—"}</small>
                    </div>
                  </li>
                  <li>
                    <span className="xd-timeline__dot is-done" />
                    <div>
                      <strong>Reimbursed by {r.reimbursedByName ?? r.reimbursedByEmail ?? "—"}</strong>
                      <small>
                        {r.reimbursedAt ? formatAppDateTime(r.reimbursedAt) : "—"} · paid from {paidFrom(detail)}
                      </small>
                    </div>
                  </li>
                </ol>
              ) : (
                <div className="xd-person">
                  <span className="xd-fact__icon">
                    <Icon source={PersonIcon} />
                  </span>
                  <div>
                    <strong>{detail.recordedBy?.name ?? detail.recordedBy?.email ?? "Unknown"}</strong>
                    <small>
                      {detail.recordedBy?.name && detail.recordedBy?.email ? `${detail.recordedBy.email} · ` : ""}
                      {formatAppDateTime(detail.createdAt)}
                    </small>
                  </div>
                </div>
              )}
            </section>

            {/* Journal */}
            {detail.journal ? (
              <section className="xd-block">
                <div className="xd-block__head">
                  <h3>Journal entry</h3>
                  <span className={cn("xd-balanced", !balanced && "is-off")}>
                    {balanced ? "Balanced" : "Out of balance"} · {detail.journal.journalCode}
                  </span>
                </div>
                <div className="xd-journal">
                  <div className="xd-journal__row is-head">
                    <span>Account</span>
                    <span>Debit</span>
                    <span>Credit</span>
                  </div>
                  {[...debits, ...credits].map((line) => (
                    <div className={cn("xd-journal__row", line.credit > 0 && "is-credit")} key={`${line.accountCode}-${line.label}-${line.debit}`}>
                      <span>
                        <Link href={`/dashboard/accounting/chart-of-accounts/${line.accountId}`}>
                          <b>{line.accountCode}</b> {line.accountName}
                        </Link>
                        {line.label && line.label !== detail.description ? <small>{line.label}</small> : null}
                      </span>
                      <span>{line.debit > 0 ? formatBaseMoney(line.debit) : ""}</span>
                      <span>{line.credit > 0 ? formatBaseMoney(line.credit) : ""}</span>
                    </div>
                  ))}
                  <div className="xd-journal__row is-total">
                    <span>Total</span>
                    <span>{formatBaseMoney(debitTotal)}</span>
                    <span>{formatBaseMoney(creditTotal)}</span>
                  </div>
                </div>
                <small className="xd-note">
                  {detail.journal.journalName} · {formatAppDate(detail.journal.moveDate)}
                  {detail.journal.postedAt ? ` · posted ${formatAppDateTime(detail.journal.postedAt)}` : ""}
                </small>
              </section>
            ) : null}

            {/* Receipt */}
            <section className={cn("xd-receipt", !detail.hasReceipt && "is-missing")}>
              <span className="xd-fact__icon">
                <Icon source={detail.hasReceipt ? ReceiptIcon : NoteIcon} />
              </span>
              <div>
                <strong>{detail.hasReceipt ? "Receipt attached" : "No receipt attached"}</strong>
                <small>
                  {detail.hasReceipt
                    ? "Opens in a new tab."
                    : detail.noReceiptReason
                      ? `Reason: ${detail.noReceiptReason}`
                      : claim
                        ? "Check the staff claim for the original receipt."
                        : "Edit the expense to upload one — useful for VAT and audits."}
                </small>
              </div>
              {detail.hasReceipt ? (
                <Button external size="slim" url={getExpenseReceiptUrl(detail.id)}>
                  View receipt
                </Button>
              ) : null}
            </section>
          </div>
        ) : null}
      </Modal.Section>
    </Modal>
  );
}
