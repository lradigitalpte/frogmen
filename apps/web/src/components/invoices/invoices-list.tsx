"use client";

import {
  Banner,
  BlockStack,
  Button,
  EmptyState,
  IndexFilters,
  IndexFiltersMode,
  IndexTable,
  InlineStack,
  Link,
  Text,
  useSetIndexFiltersMode,
} from "@shopify/polaris";
import { CalendarClock, FileText, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage, IndexSurface } from "@/components/layout/page";
import { Button as ShadcnButton } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  invoiceLifecycleLabel,
  invoiceLifecycleVariant,
  StatusBadge,
} from "@/components/ui/status-badge";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatCurrencyAmount } from "@/lib/currency-utils";
import { computeOutstandingInBase } from "@frog1/shared";
import {
  listInvoices,
  type Invoice,
} from "@/lib/invoices-api";
import { useBranchLabels } from "@/hooks/use-branch-labels";

const subNavTabs = [
  { id: "invoices", content: "Customer Invoices" },
  { id: "credit-notes", content: "Credit Notes" },
  { id: "payments", content: "Customer Payments" },
];

function statusBadge(status: Invoice["status"]) {
  return (
    <StatusBadge variant={invoiceLifecycleVariant(status)}>
      {invoiceLifecycleLabel(status)}
    </StatusBadge>
  );
}

export function InvoicesListPage() {
  const router = useRouter();
  const { formatOrgMoney, resolveCurrency } = useOrgCurrency();
  const [query, setQuery] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { mode, setMode } = useSetIndexFiltersMode(IndexFiltersMode.Filtering);
  const { showBranchColumn, branchLabel } = useBranchLabels();

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listInvoices();
      setInvoices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const filteredInvoices = useMemo(() => {
    if (!query) return invoices;
    const q = query.toLowerCase();
    return invoices.filter(
      (inv) =>
        inv.number.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q)
    );
  }, [invoices, query]);

  const totalInvoiced = useMemo(() => {
    return invoices.reduce((sum, inv) => sum + inv.amountTotalBase, 0);
  }, [invoices]);

  const receivablesDue = useMemo(() => {
    return invoices
      .filter((inv) => inv.status === "posted")
      .reduce(
        (sum, inv) =>
          sum +
          computeOutstandingInBase({
            amountTotal: inv.amountTotal,
            amountPaid: inv.amountPaid ?? 0,
            amountTotalBase: inv.amountTotalBase,
            exchangeRate: inv.exchangeRate,
          }),
        0,
      );
  }, [invoices]);

  const paidTotal = useMemo(() => {
    return invoices
      .filter((inv) => inv.status === "paid")
      .reduce((sum, inv) => sum + inv.amountTotalBase, 0);
  }, [invoices]);

  const formatInvoiceAmount = useCallback(
    (invoice: Invoice, amount: number) =>
      formatCurrencyAmount(amount, resolveCurrency(invoice.currencyId)),
    [resolveCurrency],
  );

  const rowMarkup = filteredInvoices.map((inv, index) => (
    <IndexTable.Row id={inv.id} key={inv.id} position={index}>
      <IndexTable.Cell>
        <Link url={`/dashboard/invoices/${inv.id}`}>
          <Text as="span" fontWeight="bold">
            {inv.number}
          </Text>
        </Link>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <BlockStack gap="050">
          <Text as="span" fontWeight="semibold">
            {inv.customerName}
          </Text>
          <Text as="span" tone="subdued" variant="bodySm">
            {inv.customerEmail}
          </Text>
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>{inv.invoiceDate}</IndexTable.Cell>
      <IndexTable.Cell>{inv.dueDate}</IndexTable.Cell>
      {showBranchColumn ? (
        <IndexTable.Cell>{branchLabel(inv.branchId)}</IndexTable.Cell>
      ) : null}
      <IndexTable.Cell>{statusBadge(inv.status)}</IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" fontWeight="bold" alignment="end">
          {formatInvoiceAmount(inv, inv.amountTotal)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="150">
          <Button
            size="slim"
            variant="primary"
            onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
          >
            View Invoice
          </Button>
          {inv.status === "posted" ? (
            <Button
              size="slim"
              onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
            >
              Register Payment
            </Button>
          ) : null}
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <AppPage
      backAction={{ content: "Home", url: "/dashboard" }}
      fullWidth
      primaryAction={{
        content: "+ Create Customer Invoice",
        onAction: () => router.push("/dashboard/invoices/new"),
      }}
      subtitle="Central financial hub for customer invoices, credit notes, and bank payment reconciliations."
      title="Customer Invoices"
    >
      <BlockStack gap="400">
        <InlineStack gap="200">
          <ShadcnButton variant="secondary" size="sm">
            Customer Invoices
          </ShadcnButton>
          <ShadcnButton
            variant="outline"
            size="sm"
            onClick={() => router.push("/dashboard/invoices/credit-notes")}
          >
            Credit Notes
          </ShadcnButton>
          <ShadcnButton
            variant="outline"
            size="sm"
            onClick={() => router.push("/dashboard/invoices/payments")}
          >
            Customer Payments
          </ShadcnButton>
        </InlineStack>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            icon={<FileText className="size-5" />}
            label="Total Invoiced Pipeline"
            value={formatOrgMoney(totalInvoiced)}
            hint="Total active invoices"
            tone="default"
            loading={loading}
          />
          <KpiCard
            icon={<CalendarClock className="size-5" />}
            label="Receivables / Due in 15 Days"
            value={formatOrgMoney(receivablesDue)}
            hint="Posted unpaid invoices"
            tone="warning"
            loading={loading}
          />
          <KpiCard
            icon={<Wallet className="size-5" />}
            label="Paid Invoices"
            value={formatOrgMoney(paidTotal)}
            hint="Fully collected"
            tone="success"
            loading={loading}
          />
        </div>

        {error ? <Banner tone="critical">{error}</Banner> : null}

        <IndexSurface>
          <IndexFilters
            canCreateNewView={false}
            cancelAction={{ onAction: () => setQuery(""), disabled: false, loading: false }}
            filters={[]}
            mode={mode}
            queryPlaceholder="Search invoices by invoice number or customer name..."
            queryValue={query}
            selected={0}
            tabs={subNavTabs}
            onClearAll={() => setQuery("")}
            onQueryChange={setQuery}
            onQueryClear={() => setQuery("")}
            onSelect={(idx) => {
              if (idx === 1) router.push("/dashboard/invoices/credit-notes");
              if (idx === 2) router.push("/dashboard/invoices/payments");
            }}
            setMode={setMode}
          />

          <IndexTable
            headings={[
              { title: "Invoice Number" },
              { title: "Customer Account" },
              { title: "Invoice Date" },
              { title: "Due Date" },
              ...(showBranchColumn ? [{ title: "Branch" }] : []),
              { title: "Status" },
              { title: "Total Amount", alignment: "end" },
              { title: "Actions" },
            ]}
            itemCount={filteredInvoices.length}
            loading={loading}
            resourceName={{ singular: "invoice", plural: "invoices" }}
          >
            {rowMarkup}
          </IndexTable>
        </IndexSurface>
      </BlockStack>
    </AppPage>
  );
}
