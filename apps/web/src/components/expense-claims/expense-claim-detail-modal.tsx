"use client";

import { Banner, Button, Icon, Modal, type IconSource } from "@shopify/polaris";
import {
  BankIcon,
  CalendarIcon,
  CategoriesIcon,
  HashtagIcon,
  NoteIcon,
  PersonIcon,
  ReceiptIcon,
} from "@shopify/polaris-icons";
import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
  ExpenseClaimStatusBadge,
  formatExpenseClaimDate,
  formatExpenseClaimDateTime,
  formatExpenseClaimPaymentMethod,
} from "@/components/expense-claims/expense-claim-utils";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  getExpenseClaimReceiptUrl,
  type ExpenseClaim,
} from "@/lib/expense-claims-api";

interface ExpenseClaimDetailModalProps {
  open: boolean;
  claim: ExpenseClaim | null;
  onClose: () => void;
  mode: "review" | "mine";
  actionLoading?: boolean;
  onApprove?: (claim: ExpenseClaim) => void;
  onReject?: (claim: ExpenseClaim) => void;
  onReimburse?: (claim: ExpenseClaim) => void;
  onCorrect?: (claim: ExpenseClaim) => void;
  onSendBack?: (claim: ExpenseClaim) => void;
  onWithdraw?: (claim: ExpenseClaim) => void;
  onDelete?: (claim: ExpenseClaim) => void;
  /** Employee actions (mode "mine"). */
  onEdit?: (claim: ExpenseClaim) => void;
  onSubmit?: (claim: ExpenseClaim) => void;
  onRevise?: (claim: ExpenseClaim) => void;
  onRequestEdit?: (claim: ExpenseClaim) => void;
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

function Step({ title, at, done }: { title: string; at: string; done?: boolean }) {
  return (
    <li>
      <span className={cn("xd-timeline__dot", done && "is-done")} />
      <div>
        <strong>{title}</strong>
        <small>{at}</small>
      </div>
    </li>
  );
}

function statusHint(claim: ExpenseClaim) {
  switch (claim.status) {
    case "draft":
      return "Not submitted yet";
    case "submitted":
      return "Waiting for finance";
    case "approved":
      return "Waiting to be paid";
    case "rejected":
      return "Needs changes";
    default:
      return "Paid and posted";
  }
}

export function ExpenseClaimDetailModal({
  open,
  claim,
  onClose,
  mode,
  actionLoading = false,
  onApprove,
  onReject,
  onReimburse,
  onCorrect,
  onSendBack,
  onWithdraw,
  onDelete,
  onEdit,
  onSubmit,
  onRevise,
  onRequestEdit,
}: ExpenseClaimDetailModalProps) {
  const { formatBaseMoney } = useOrgCurrency();
  const { data: session } = useSession();
  const [receiptPreviewFailed, setReceiptPreviewFailed] = useState(false);

  useEffect(() => {
    if (open) {
      setReceiptPreviewFailed(false);
    }
  }, [open, claim?.id]);

  if (!claim) return null;

  const receiptUrl = getExpenseClaimReceiptUrl(claim.id);

  const primaryAction =
    mode === "review" && claim.status === "submitted" && onApprove
      ? {
          content: "Approve…",
          loading: actionLoading,
          onAction: () => onApprove(claim),
        }
      : mode === "review" && claim.status === "approved" && onReimburse
        ? {
            content: "Record reimbursement",
            loading: actionLoading,
            onAction: () => onReimburse(claim),
          }
        : mode === "mine" && claim.status === "draft" && onSubmit
          ? {
              content: "Submit for approval",
              loading: actionLoading,
              onAction: () => onSubmit(claim),
            }
          : mode === "mine" && claim.status === "rejected" && onRevise
            ? {
                content: "Revise & resubmit",
                loading: actionLoading,
                onAction: () => onRevise(claim),
              }
            : undefined;

  const secondaryActions = [
    { content: "Close", onAction: onClose },
    ...(mode === "mine" && (claim.status === "draft" || claim.status === "submitted") && onEdit
      ? [{ content: "Edit", disabled: actionLoading, onAction: () => onEdit(claim) }]
      : []),
    ...(mode === "mine" && claim.status === "approved" && onRequestEdit
      ? [{ content: "Request edit", disabled: actionLoading, onAction: () => onRequestEdit(claim) }]
      : []),
    ...(mode === "mine" && claim.status === "submitted" && onWithdraw
      ? [
          {
            content: "Cancel submission",
            disabled: actionLoading,
            onAction: () => onWithdraw(claim),
          },
        ]
      : []),
    ...(mode === "mine" &&
    onDelete &&
    (claim.status === "draft" ||
      claim.status === "submitted" ||
      claim.status === "rejected")
      ? [
          {
            content: "Delete",
            destructive: true as const,
            disabled: actionLoading,
            onAction: () => onDelete(claim),
          },
        ]
      : []),
    ...(mode === "review" &&
    claim.submittedByUserId === session?.user.id &&
    claim.status !== "reimbursed"
      ? [{ content: "Edit in My claims", url: "/dashboard/profile/expense-claims" }]
      : []),
    ...(mode === "review" && claim.status === "approved" && onSendBack
      ? [{ content: "Send back to draft", disabled: actionLoading, onAction: () => onSendBack(claim) }]
      : []),
    ...(mode === "review" && claim.status === "reimbursed" && onCorrect
      ? [{ content: "Correct payment", disabled: actionLoading, onAction: () => onCorrect(claim) }]
      : []),
    ...(mode === "review" && claim.status === "submitted" && onReject
      ? [
          {
            content: "Reject",
            destructive: true as const,
            disabled: actionLoading,
            onAction: () => onReject(claim),
          },
        ]
      : []),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Claim ${claim.number}`}
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
      size="large"
    >
      <Modal.Section>
        <div className="xd">
          {claim.rejectionReason && (claim.status === "rejected" || claim.status === "draft") ? (
            <Banner
              tone={claim.status === "rejected" ? "critical" : "warning"}
              title={claim.status === "rejected" ? "Rejected by finance" : "Sent back by finance"}
            >
              {claim.rejectionReason}
            </Banner>
          ) : null}

          <div className="xd-hero">
            <div className="xd-hero__main">
              <span className="xd-hero__label">Expense claim</span>
              <strong>{formatBaseMoney(claim.amount)}</strong>
              <p>{claim.description}</p>
            </div>
            <div className="xd-hero__badges">
              <ExpenseClaimStatusBadge status={claim.status} />
              <span className="xd-hero__date">{statusHint(claim)}</span>
            </div>
          </div>

          <div className="xd-facts">
            <Fact icon={PersonIcon} label="Employee">
              {claim.submitterName || claim.submitterEmail}
              {claim.submitterName ? <small>{claim.submitterEmail}</small> : null}
            </Fact>
            <Fact icon={CalendarIcon} label="Expense date">
              {formatExpenseClaimDate(claim.expenseDate)}
            </Fact>
            <Fact icon={CategoriesIcon} label="Category">
              {claim.categoryName ?? <span className="xd-muted">Not categorised</span>}
            </Fact>
            <Fact icon={HashtagIcon} label="Reference">
              {claim.reference ?? <span className="xd-muted">None</span>}
            </Fact>
            {claim.status === "reimbursed" && claim.paymentMethod ? (
              <>
                <Fact icon={BankIcon} label="Paid with">
                  {formatExpenseClaimPaymentMethod(claim.paymentMethod)}
                  {claim.bankAccountName ? <small>{claim.bankAccountName}</small> : null}
                </Fact>
                <Fact icon={CalendarIcon} label="Payment date">
                  {claim.paymentDate
                    ? formatExpenseClaimDate(claim.paymentDate)
                    : formatExpenseClaimDateTime(claim.reimbursedAt)}
                </Fact>
              </>
            ) : null}
          </div>

          <section className="xd-block">
            <h3>Receipt</h3>
            <div className={cn("xd-receipt", !claim.hasReceipt && "is-missing")}>
              <span className="xd-fact__icon">
                <Icon source={claim.hasReceipt ? ReceiptIcon : NoteIcon} />
              </span>
              <div>
                <strong>{claim.hasReceipt ? "Receipt attached" : "No receipt"}</strong>
                <small>
                  {claim.hasReceipt
                    ? receiptPreviewFailed
                      ? "No preview available. Open the file to view it."
                      : "Opens in a new tab."
                    : claim.noReceiptReason
                      ? `Reason: ${claim.noReceiptReason}`
                      : "No reason was given."}
                </small>
              </div>
              {claim.hasReceipt ? (
                <Button external size="slim" url={receiptUrl}>
                  View receipt
                </Button>
              ) : null}
            </div>
            {claim.hasReceipt && !receiptPreviewFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="xd-preview"
                src={receiptUrl}
                alt={`Receipt for ${claim.number}`}
                onError={() => setReceiptPreviewFailed(true)}
              />
            ) : null}
          </section>

          <section className="xd-block">
            <h3>History</h3>
            <ol className="xd-timeline">
              <Step
                title={`Created by ${claim.submitterName || claim.submitterEmail}`}
                at={formatExpenseClaimDateTime(claim.createdAt)}
              />
              {claim.editReason ? (
                <Step title="Reopened for editing after approval" at={`Reason: ${claim.editReason}`} />
              ) : null}
              {claim.submittedAt ? (
                <Step title="Submitted for approval" at={formatExpenseClaimDateTime(claim.submittedAt)} />
              ) : null}
              {claim.reviewedAt && claim.status !== "submitted" ? (
                <Step
                  done={claim.status === "approved" || claim.status === "reimbursed"}
                  title={`${
                    claim.status === "approved" || claim.status === "reimbursed"
                      ? "Approved"
                      : claim.status === "rejected"
                        ? "Rejected"
                        : "Sent back"
                  } by ${claim.reviewedByName ?? claim.reviewedByEmail ?? "finance"}`}
                  at={formatExpenseClaimDateTime(claim.reviewedAt)}
                />
              ) : null}
              {claim.status === "reimbursed" ? (
                <Step
                  done
                  title={`Reimbursed by ${claim.reimbursedByName ?? claim.reimbursedByEmail ?? "finance"}`}
                  at={`${formatExpenseClaimDateTime(claim.reimbursedAt)} · posted to Operating Expenses`}
                />
              ) : null}
            </ol>
          </section>
        </div>
      </Modal.Section>
    </Modal>
  );
}
