"use client";

import {
  Badge,
  BlockStack,
  Box,
  Button,
  Divider,
  InlineStack,
  Link,
  Modal,
  Spinner,
  Text,
} from "@shopify/polaris";
import { useEffect, useState, type ReactNode } from "react";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  getExpense,
  getExpenseReceiptUrl,
  type ExpenseDetail,
} from "@/lib/expenses-api";

function formatExpenseDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function paymentMethodLabel(detail: ExpenseDetail) {
  switch (detail.paymentMethod) {
    case "cash":
      return "Cash (petty cash)";
    case "cheque":
      return "Cheque (cash journal)";
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

function paidFromSummary(detail: ExpenseDetail) {
  if (detail.source === "reimbursement") {
    if (detail.paymentSource === "cash") {
      return "Staff reimbursement paid from Cash (101501)";
    }
    return detail.bankAccountName
      ? `Staff reimbursement paid from ${detail.bankAccountName}`
      : "Staff reimbursement paid from bank";
  }
  if (detail.paymentSource === "cash") {
    return "Cash account 101501";
  }
  if (detail.bankAccountName) {
    return detail.bankAccountName;
  }
  if (detail.paymentSourceLabel) {
    return detail.paymentSourceLabel;
  }
  return "Bank / card";
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="quotation-summary-row">
      <Text as="span" tone="subdued" variant="bodySm">
        {label}
      </Text>
      <Box maxWidth="60%">
        <Text as="span" alignment="end" variant="bodyMd">
          {children}
        </Text>
      </Box>
    </div>
  );
}

interface ExpenseDetailModalProps {
  expenseId: string | null;
  onClose: () => void;
  onEdit?: (detail: ExpenseDetail) => void;
}

export function ExpenseDetailModal({
  expenseId,
  onClose,
  onEdit,
}: ExpenseDetailModalProps) {
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

  const title = detail?.number ?? "Expense";

  return (
    <Modal
      open={Boolean(expenseId)}
      onClose={onClose}
      title={title}
      primaryAction={
        detail && detail.source === "manual" && onEdit
          ? {
              content: "Edit expense",
              onAction: () => {
                onEdit(detail);
                onClose();
              },
            }
          : undefined
      }
      secondaryActions={[{ content: "Close", onAction: onClose }]}
      size="large"
    >
      <Modal.Section>
        {loading ? (
          <InlineStack align="center" blockAlign="center" gap="200">
            <Spinner size="small" />
            <Text as="span" tone="subdued">
              Loading expense details…
            </Text>
          </InlineStack>
        ) : null}
        {error ? (
          <Text as="p" tone="critical">
            {error}
          </Text>
        ) : null}
        {detail && !loading ? (
          <BlockStack gap="500">
            <InlineStack gap="200" blockAlign="center">
              {detail.source === "reimbursement" ? (
                <Badge tone="info">Staff reimbursement</Badge>
              ) : (
                <Badge>Company expense</Badge>
              )}
              {detail.journal?.state === "posted" ? (
                <Badge tone="success">Posted to ledger</Badge>
              ) : null}
            </InlineStack>

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Expense
              </Text>
              <div className="quotation-summary-panel__rows">
                <DetailRow label="Amount">
                  <Text as="span" fontWeight="bold">
                    {formatBaseMoney(detail.amount)}
                  </Text>
                </DetailRow>
                <DetailRow label="Date">{formatExpenseDate(detail.expenseDate)}</DetailRow>
                <DetailRow label="Category">{detail.categoryName ?? "—"}</DetailRow>
                <DetailRow label="Description">{detail.description}</DetailRow>
                <DetailRow label="Reference">
                  {detail.reference?.trim() ? detail.reference : "—"}
                </DetailRow>
                <DetailRow label="Payment method">
                  {paymentMethodLabel(detail)}
                </DetailRow>
                <DetailRow label="Paid from">{paidFromSummary(detail)}</DetailRow>
              </div>
            </BlockStack>

            <Divider />

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Who recorded it
              </Text>
              <div className="quotation-summary-panel__rows">
                {detail.source === "reimbursement" && detail.reimbursement ? (
                  <>
                    <DetailRow label="Staff member">
                      {detail.reimbursement.submitterName ??
                        detail.reimbursement.submitterEmail ??
                        "—"}
                    </DetailRow>
                    <DetailRow label="Claim">
                      {detail.reimbursement.claimNumber ?? "—"}
                    </DetailRow>
                    <DetailRow label="Reimbursed by">
                      {detail.reimbursement.reimbursedByName ??
                        detail.reimbursement.reimbursedByEmail ??
                        "—"}
                    </DetailRow>
                    <DetailRow label="Reimbursed at">
                      {formatDateTime(detail.reimbursement.reimbursedAt)}
                    </DetailRow>
                    <DetailRow label="Claim submitted">
                      {formatDateTime(detail.reimbursement.submittedAt)}
                    </DetailRow>
                  </>
                ) : (
                  <>
                    <DetailRow label="Recorded by">
                      {detail.recordedBy?.name ??
                        detail.recordedBy?.email ??
                        "—"}
                    </DetailRow>
                    {detail.recordedBy?.email && detail.recordedBy?.name ? (
                      <DetailRow label="Email">{detail.recordedBy.email}</DetailRow>
                    ) : null}
                    <DetailRow label="Recorded at">
                      {formatDateTime(detail.createdAt)}
                    </DetailRow>
                  </>
                )}
              </div>
              {detail.source === "reimbursement" && detail.reimbursement?.claimId ? (
                <Link url="/dashboard/accounting/expense-reimbursements">
                  Open expense reimbursements
                </Link>
              ) : null}
            </BlockStack>

            {detail.journal ? (
              <>
                <Divider />
                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">
                      Journal entry
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      {detail.journal.journalCode} · {detail.journal.journalName}{" "}
                      · {formatExpenseDate(detail.journal.moveDate)}
                      {detail.journal.reference
                        ? ` · Ref ${detail.journal.reference}`
                        : ""}
                    </Text>
                  </BlockStack>
                  <div className="accounting-report-table">
                    <table className="expense-journal-lines">
                      <thead>
                        <tr>
                          <th>Account</th>
                          <th>Label</th>
                          <th className="expense-journal-lines__num">Debit</th>
                          <th className="expense-journal-lines__num">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.journal.lines.map((line) => (
                          <tr key={`${line.accountCode}-${line.label}`}>
                            <td>
                              <Link
                                url={`/dashboard/accounting/chart-of-accounts/${line.accountId}`}
                              >
                                {line.accountCode} {line.accountName}
                              </Link>
                            </td>
                            <td>
                              <Text as="span" variant="bodySm">
                                {line.label}
                              </Text>
                            </td>
                            <td className="expense-journal-lines__num">
                              {line.debit > 0 ? formatBaseMoney(line.debit) : "—"}
                            </td>
                            <td className="expense-journal-lines__num">
                              {line.credit > 0 ? formatBaseMoney(line.credit) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </BlockStack>
              </>
            ) : null}

            {detail.hasReceipt ? (
              <>
                <Divider />
                <InlineStack gap="200" blockAlign="center">
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    Receipt
                  </Text>
                  <Button url={getExpenseReceiptUrl(detail.id)} external size="slim">
                    View receipt
                  </Button>
                </InlineStack>
              </>
            ) : null}
          </BlockStack>
        ) : null}
      </Modal.Section>
    </Modal>
  );
}
