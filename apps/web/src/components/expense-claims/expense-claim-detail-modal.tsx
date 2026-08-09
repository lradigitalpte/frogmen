"use client";

import {
  Banner,
  BlockStack,
  Box,
  Button,
  Divider,
  InlineStack,
  Modal,
  Text,
} from "@shopify/polaris";
import { useEffect, useState } from "react";
import {
  ExpenseClaimStatusBadge,
  formatExpenseClaimActor,
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
  onWithdraw?: (claim: ExpenseClaim) => void;
  onDelete?: (claim: ExpenseClaim) => void;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <InlineStack align="space-between" blockAlign="start" gap="400">
      <Text as="span" tone="subdued">{label}</Text>
      <div className="expense-claim-detail__value">{value}</div>
    </InlineStack>
  );
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
  onWithdraw,
  onDelete,
}: ExpenseClaimDetailModalProps) {
  const { formatBaseMoney } = useOrgCurrency();
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
        : undefined;

  const secondaryActions = [
    { content: "Close", onAction: onClose },
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
        <BlockStack gap="500">
          <InlineStack gap="200" blockAlign="center">
            <ExpenseClaimStatusBadge status={claim.status} />
            <Text as="span" tone="subdued">
              Submitted by {claim.submitterName}
            </Text>
          </InlineStack>

          {claim.status === "approved" ? (
            <Banner tone="warning">
              Approved — awaiting reimbursement. Not on Profit &amp; Loss until
              payment is recorded.
            </Banner>
          ) : null}
          {claim.status === "reimbursed" ? (
            <Banner tone="success">
              Posted to Operating Expenses. Visible on Profit &amp; Loss.
            </Banner>
          ) : null}

          <BlockStack gap="300">
            <DetailRow
              label="Employee"
              value={
                <BlockStack gap="050">
                  <span>{claim.submitterName}</span>
                  <Text as="span" tone="subdued" variant="bodySm">
                    {claim.submitterEmail}
                  </Text>
                </BlockStack>
              }
            />
            <DetailRow
              label="Expense date"
              value={formatExpenseClaimDate(claim.expenseDate)}
            />
            <DetailRow label="Category" value={claim.categoryName ?? "—"} />
            <DetailRow label="Description" value={<Text as="span" fontWeight="semibold">{claim.description}</Text>} />
            <DetailRow label="Reference" value={claim.reference ?? "—"} />
            <DetailRow label="Amount" value={<Text as="span" fontWeight="semibold">{formatBaseMoney(claim.amount)}</Text>} />
          </BlockStack>

          <Divider />

          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">Audit trail</Text>
            <DetailRow
              label="Claim created"
              value={
                <BlockStack gap="050">
                  <span>{formatExpenseClaimDateTime(claim.createdAt)}</span>
                  <Text as="span" tone="subdued" variant="bodySm">
                    By {formatExpenseClaimActor(claim.submitterName, claim.submitterEmail)}
                  </Text>
                </BlockStack>
              }
            />
            {claim.submittedAt ? (
              <DetailRow
                label="Submitted for approval"
                value={
                  <BlockStack gap="050">
                    <span>{formatExpenseClaimDateTime(claim.submittedAt)}</span>
                    <Text as="span" tone="subdued" variant="bodySm">
                      By {formatExpenseClaimActor(claim.submitterName, claim.submitterEmail)}
                    </Text>
                  </BlockStack>
                }
              />
            ) : null}
            {claim.status === "rejected" && claim.reviewedAt ? (
              <DetailRow
                label="Rejected by"
                value={
                  <BlockStack gap="050">
                    <span>
                      {formatExpenseClaimActor(
                        claim.reviewedByName,
                        claim.reviewedByEmail,
                      )}
                    </span>
                    <Text as="span" tone="subdued" variant="bodySm">
                      {formatExpenseClaimDateTime(claim.reviewedAt)}
                    </Text>
                  </BlockStack>
                }
              />
            ) : null}
            {(claim.status === "approved" || claim.status === "reimbursed") &&
            claim.reviewedAt ? (
              <DetailRow
                label="Approved by"
                value={
                  <BlockStack gap="050">
                    <span>
                      {formatExpenseClaimActor(
                        claim.reviewedByName,
                        claim.reviewedByEmail,
                      )}
                    </span>
                    <Text as="span" tone="subdued" variant="bodySm">
                      {formatExpenseClaimDateTime(claim.reviewedAt)}
                    </Text>
                  </BlockStack>
                }
              />
            ) : null}
            {claim.rejectionReason ? (
              <DetailRow label="Rejection reason" value={claim.rejectionReason} />
            ) : null}
            {claim.status === "reimbursed" && claim.reimbursedAt ? (
              <>
                <DetailRow
                  label="Reimbursed by"
                  value={
                    <BlockStack gap="050">
                      <span>
                        {formatExpenseClaimActor(
                          claim.reimbursedByName,
                          claim.reimbursedByEmail,
                        )}
                      </span>
                      <Text as="span" tone="subdued" variant="bodySm">
                        {formatExpenseClaimDateTime(claim.reimbursedAt)}
                      </Text>
                    </BlockStack>
                  }
                />
                {claim.paymentMethod ? (
                  <DetailRow
                    label="Payment"
                    value={
                      claim.bankAccountName
                        ? `${formatExpenseClaimPaymentMethod(claim.paymentMethod)} · ${claim.bankAccountName}`
                        : formatExpenseClaimPaymentMethod(claim.paymentMethod)
                    }
                  />
                ) : null}
                {claim.accountMoveId ? (
                  <DetailRow
                    label="Books reference"
                    value={`Journal posted · ref ${claim.number}`}
                  />
                ) : null}
              </>
            ) : null}
            {claim.status === "approved" ? (
              <DetailRow label="Reimbursed by" value="Not yet paid" />
            ) : null}
          </BlockStack>

          <Divider />

          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">Receipt</Text>
            {claim.hasReceipt ? (
              <BlockStack gap="300">
                <InlineStack gap="200">
                  <Button url={receiptUrl} external>
                    Open receipt in new tab
                  </Button>
                </InlineStack>
                {!receiptPreviewFailed ? (
                  <Box
                    background="bg-surface-secondary"
                    padding="400"
                    borderRadius="200"
                  >
                    {/* Inline preview for images; PDFs fall back to link only */}
                    <img
                      src={receiptUrl}
                      alt={`Receipt for ${claim.number}`}
                      style={{
                        maxWidth: "100%",
                        maxHeight: "420px",
                        objectFit: "contain",
                        display: "block",
                        margin: "0 auto",
                      }}
                      onError={() => setReceiptPreviewFailed(true)}
                    />
                  </Box>
                ) : (
                  <Text as="p" tone="subdued" variant="bodySm">
                    Preview not available (likely a PDF). Use the button above to
                    open the file.
                  </Text>
                )}
              </BlockStack>
            ) : (
              <Text as="p" tone="subdued">
                No receipt attached to this claim.
              </Text>
            )}
          </BlockStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
