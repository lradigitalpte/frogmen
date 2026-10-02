"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  IndexTable,
  InlineStack,
  Link,
  Modal,
  Text,
} from "@shopify/polaris";
import { Banknote, Calendar, FileText, Receipt } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ExpenseDetailModal } from "@/components/accounting/expense-detail-modal";
import { ExpenseFormModal } from "@/components/accounting/expense-form-modal";
import { AppPage } from "@/components/layout/page";
import { KpiCard } from "@/components/ui/kpi-card";
import { todayIsoDate } from "@/components/sales/format-money";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { downloadCsv } from "@/lib/export-csv";
import {
  deleteExpense,
  getExpenseReceiptUrl,
  listExpenses,
  type ExpenseDetail,
  type ExpenseRecord,
  type ExpensesListResponse,
} from "@/lib/expenses-api";

function formatExpenseDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function paymentSourceLabel(expense: ExpenseRecord) {
  const source = expense.paymentSource ?? "bank";
  if (expense.source === "reimbursement") {
    if (source === "cash") return "Staff claim · Cash";
    return `Staff claim · ${expense.bankAccountName ?? "Bank"}`;
  }
  if (source === "cash") return "Cash (101501)";
  return expense.bankAccountName ?? expense.paymentSourceLabel ?? "Bank";
}

export function ExpensesPage() {
  const { formatBaseMoney } = useOrgCurrency();
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExpensesListResponse | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(
    null,
  );
  const [deletingExpense, setDeletingExpense] = useState<ExpenseRecord | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [viewingExpenseId, setViewingExpenseId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listExpenses());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function handleExport() {
    if (!data?.expenses.length) return;

    const rows: string[][] = [
      ["Expenses", `Exported ${todayIsoDate()}`],
      [],
      [
        "Number",
        "Date",
        "Category",
        "Description",
        "Reference",
        "Paid from",
        "Amount",
      ],
      ...data.expenses.map((expense) => [
        expense.number,
        expense.expenseDate,
        expense.categoryName ?? "",
        expense.description,
        expense.reference ?? "",
        paymentSourceLabel(expense),
        String(expense.amount),
      ]),
    ];

    downloadCsv(`expenses-${todayIsoDate()}.csv`, rows);
  }

  async function handleDelete() {
    if (!deletingExpense) return;
    setDeleting(true);
    setError(null);

    try {
      await deleteExpense(deletingExpense.id);
      setSuccess(`Deleted expense ${deletingExpense.number}`);
      setDeletingExpense(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete expense");
    } finally {
      setDeleting(false);
    }
  }

  const expenseRows = data?.expenses.map((expense, index) => (
    <IndexTable.Row id={expense.id} key={expense.id} position={index}>
      <IndexTable.Cell>
        <Button
          variant="plain"
          onClick={() => setViewingExpenseId(expense.id)}
        >
          {expense.number}
        </Button>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {formatExpenseDate(expense.expenseDate)}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" tone="subdued">
          {expense.categoryName ?? "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200" blockAlign="center" wrap={false}>
          <Text as="span" truncate>
            {expense.description}
          </Text>
          {expense.source === "reimbursement" ? (
            <Badge tone="info">Staff claim</Badge>
          ) : null}
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" tone="subdued" variant="bodySm">
          {expense.reference || " "}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{paymentSourceLabel(expense)}</IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" alignment="end" numeric>
          {formatBaseMoney(expense.amount)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {expense.hasReceipt ? (
          <Button
            size="slim"
            url={getExpenseReceiptUrl(expense.id)}
            external
          >
            View
          </Button>
        ) : (
          <Text as="span" tone="subdued">
            —
          </Text>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="150" wrap={false}>
          <Button size="slim" onClick={() => setViewingExpenseId(expense.id)}>
            View
          </Button>
          {expense.source !== "reimbursement" ? (
            <>
              <Button
                size="slim"
                onClick={() => {
                  setEditingExpense(expense);
                  setModalOpen(true);
                }}
              >
                Edit
              </Button>
              <Button
                size="slim"
                tone="critical"
                onClick={() => setDeletingExpense(expense)}
              >
                Delete
              </Button>
            </>
          ) : null}
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <AppPage
      title="Expenses & Petty Cash"
      subtitle="Record petty cash and operating expenses. Amounts post automatically to your books."
      primaryAction={{
        content: "Record expense",
        onAction: () => {
          setEditingExpense(null);
          setModalOpen(true);
        },
      }}
      secondaryActions={[
        {
          content: "Expense categories",
          url: "/dashboard/accounting/expense-categories",
        },
        {
          content: "Profit & Loss",
          url: "/dashboard/accounting/profit-loss",
        },
      ]}
    >
      <BlockStack gap="500">
        {success ? (
          <Banner tone="success" onDismiss={() => setSuccess(null)}>
            {success}
          </Banner>
        ) : null}
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <Banner tone="info">
          <p>
            Company-paid spend and reimbursed staff claims post here:{" "}
            <strong>Dr 600000 Operating Expenses</strong>,{" "}
            <strong>Cr Cash (101501)</strong> or the selected{" "}
            <strong>bank GL account</strong>. All amounts appear on{" "}
            <Link url="/dashboard/accounting/profit-loss">Profit & Loss</Link>.
            Staff claims are recorded from{" "}
            <Link url="/dashboard/accounting/expense-reimbursements">
              Expense reimbursements
            </Link>{" "}
            when you reimburse.
          </p>
        </Banner>

        {data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              icon={<Calendar className="size-5" />}
              label="This Month"
              value={formatBaseMoney(data.summary.monthTotal)}
              hint={`${data.summary.monthCount} expense${data.summary.monthCount === 1 ? "" : "s"}`}
              tone="default"
              loading={loading}
            />
            <KpiCard
              icon={<Banknote className="size-5" />}
              label="Paid from Cash"
              value={formatBaseMoney(data.summary.cashTotal)}
              hint="Petty cash"
              tone="success"
              loading={loading}
            />
            <KpiCard
              icon={<Receipt className="size-5" />}
              label="Paid from Bank"
              value={formatBaseMoney(data.summary.bankTotal)}
              hint="Bank transfers"
              tone="default"
              loading={loading}
            />
          </div>
        ) : null}

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Recent expenses
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Posted journal entries debiting account 600000
                </Text>
              </BlockStack>
              <Button disabled={!data?.expenses.length} onClick={handleExport}>
                Export CSV
              </Button>
            </InlineStack>

            {loading ? (
              <Text as="p" tone="subdued">
                Loading expenses...
              </Text>
            ) : !data?.expenses.length ? (
              <div className="accounting-chart-empty">
                <FileText className="mx-auto mb-2 size-8 opacity-40" />
                <Text as="p" variant="headingSm">
                  No expenses recorded yet
                </Text>
                <Text as="p" tone="subdued">
                  Click Record expense to log your first petty-cash or operating
                  expense.
                </Text>
              </div>
            ) : (
              <div className="accounting-report-table">
                <IndexTable
                  selectable={false}
                  itemCount={data.expenses.length}
                  headings={[
                    { title: "Number" },
                    { title: "Date" },
                    { title: "Category" },
                    { title: "Description" },
                    { title: "Reference" },
                    { title: "Paid from" },
                    { title: "Amount", alignment: "end" },
                    { title: "Receipt" },
                    { title: "Actions" },
                  ]}
                >
                  {expenseRows}
                </IndexTable>
              </div>
            )}
          </BlockStack>
        </Card>
      </BlockStack>

      <ExpenseDetailModal
        expenseId={viewingExpenseId}
        onClose={() => setViewingExpenseId(null)}
        onEdit={(detail: ExpenseDetail) => {
          setEditingExpense(detail);
          setModalOpen(true);
        }}
      />

      <ExpenseFormModal
        open={modalOpen}
        expense={editingExpense}
        onClose={() => {
          setModalOpen(false);
          setEditingExpense(null);
        }}
        onSaved={async () => {
          setSuccess(
            editingExpense
              ? "Expense updated."
              : "Expense recorded and posted to Operating Expenses (600000).",
          );
          await load();
        }}
      />

      <Modal
        open={Boolean(deletingExpense)}
        onClose={() => setDeletingExpense(null)}
        title="Delete expense?"
        primaryAction={{
          content: "Delete",
          destructive: true,
          loading: deleting,
          onAction: () => void handleDelete(),
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setDeletingExpense(null) },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            This will reverse the journal entry for{" "}
            <strong>{deletingExpense?.number}</strong> ({deletingExpense?.description}
            ). The expense will be removed from your list.
          </Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
