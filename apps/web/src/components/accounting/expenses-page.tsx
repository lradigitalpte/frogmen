"use client";

import {
  Banner,
  BlockStack,
  Button,
  Card,
  FormLayout,
  IndexTable,
  InlineGrid,
  InlineStack,
  Link,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { KpiCard } from "@/components/ui/kpi-card";
import { todayIsoDate } from "@/components/sales/format-money";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  createExpense,
  listExpenses,
  type ExpenseRecord,
  type ExpensesListResponse,
} from "@/lib/accounting-api";
import { downloadCsv } from "@/lib/export-csv";
import { Banknote, Calendar, Receipt } from "lucide-react";

const paymentMethods = [
  { label: "Cash", value: "cash" },
  { label: "Bank transfer", value: "bank_transfer" },
  { label: "Wire transfer", value: "wire_transfer" },
  { label: "Cheque", value: "cheque" },
];

function formatExpenseDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function paymentSourceLabel(source: ExpenseRecord["paymentSource"]) {
  return source === "cash" ? "Cash" : "Bank";
}

export function ExpensesPage() {
  const { formatBaseMoney, baseCurrencyCode } = useOrgCurrency();
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayIsoDate());
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExpensesListResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listExpenses());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit() {
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await createExpense({
        amount: parsedAmount,
        expenseDate,
        description: description.trim(),
        paymentMethod,
        reference: reference.trim() || undefined,
      });
      setSuccess(
        "Expense recorded and posted to Operating Expenses (600000).",
      );
      setAmount("");
      setDescription("");
      setReference("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record expense");
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    if (!data?.expenses.length) return;

    const rows: string[][] = [
      ["Expenses", `Exported ${todayIsoDate()}`],
      [],
      ["Date", "Description", "Reference", "Paid from", "Amount"],
      ...data.expenses.map((expense) => [
        expense.expenseDate,
        expense.description,
        expense.reference ?? "",
        paymentSourceLabel(expense.paymentSource),
        String(expense.amount),
      ]),
    ];

    downloadCsv(`expenses-${todayIsoDate()}.csv`, rows);
  }

  const expenseRows = data?.expenses.map((expense, index) => (
    <IndexTable.Row id={expense.id} key={expense.id} position={index}>
      <IndexTable.Cell>
        {formatExpenseDate(expense.expenseDate)}
      </IndexTable.Cell>
      <IndexTable.Cell>{expense.description}</IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" tone="subdued" variant="bodySm">
          {expense.reference || " "}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{paymentSourceLabel(expense.paymentSource)}</IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" alignment="end" numeric>
          {formatBaseMoney(expense.amount)}
        </Text>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <AppPage
      title="Expenses & Petty Cash"
      subtitle="Record petty cash and operating expenses. Amounts post automatically to your books."
      secondaryActions={[
        {
          content: "Profit & Loss",
          url: "/dashboard/accounting/profit-loss",
        },
        {
          content: "Chart of Accounts",
          url: "/dashboard/accounting/chart-of-accounts",
        },
      ]}
    >
      <BlockStack gap="500">
        {success ? <Banner tone="success">{success}</Banner> : null}
        {error ? <Banner tone="critical">{error}</Banner> : null}

        <Banner tone="info">
          <p>
            Each entry posts automatically: <strong>Dr 600000 Operating Expenses</strong>,{" "}
            <strong>Cr Cash (101501)</strong> or <strong>Bank (101401)</strong>.
            Expenses appear on your{" "}
            <Link url="/dashboard/accounting/profit-loss">Profit & Loss</Link> report.
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

        <InlineGrid columns={{ xs: 1, lg: ["oneThird", "twoThirds"] }} gap="500">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Record expense
              </Text>

              <FormLayout>
                <TextField
                  autoComplete="off"
                  label="Description"
                  value={description}
                  onChange={setDescription}
                  placeholder="e.g. Office supplies, fuel, courier"
                />
                <FormLayout.Group>
                  <TextField
                    autoComplete="off"
                    label={`Amount (${baseCurrencyCode})`}
                    type="number"
                    value={amount}
                    onChange={setAmount}
                    min={0}
                    step={0.01}
                  />
                  <TextField
                    autoComplete="off"
                    label="Date"
                    type="date"
                    value={expenseDate}
                    onChange={setExpenseDate}
                  />
                </FormLayout.Group>
                <Select
                  label="Paid from"
                  options={paymentMethods}
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  helpText="Cash and cheque use the Cash journal; bank/wire use Bank."
                />
                <TextField
                  autoComplete="off"
                  label="Reference / receipt (optional)"
                  value={reference}
                  onChange={setReference}
                  placeholder="Receipt no., vendor ref, etc."
                />
              </FormLayout>

              <Button
                variant="primary"
                fullWidth
                loading={saving}
                onClick={() => void handleSubmit()}
              >
                Record expense
              </Button>
            </BlockStack>
          </Card>

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
                <Button
                  disabled={!data?.expenses.length}
                  onClick={handleExport}
                >
                  Export CSV
                </Button>
              </InlineStack>

              {loading ? (
                <Text as="p" tone="subdued">
                  Loading expenses...
                </Text>
              ) : !data?.expenses.length ? (
                <div className="accounting-chart-empty">
                  <Text as="p" variant="headingSm">
                    No expenses recorded yet
                  </Text>
                  <Text as="p" tone="subdued">
                    Use the form to record your first petty-cash or operating
                    expense.
                  </Text>
                </div>
              ) : (
                <div className="accounting-report-table">
                  <IndexTable
                    selectable={false}
                    itemCount={data.expenses.length}
                    headings={[
                      { title: "Date" },
                      { title: "Description" },
                      { title: "Reference" },
                      { title: "Paid from" },
                      { title: "Amount", alignment: "end" },
                    ]}
                  >
                    {expenseRows}
                  </IndexTable>
                </div>
              )}
            </BlockStack>
          </Card>
        </InlineGrid>
      </BlockStack>
    </AppPage>
  );
}
