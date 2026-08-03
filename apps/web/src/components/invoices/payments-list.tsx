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
  Text,
  useSetIndexFiltersMode,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage, IndexSurface } from "@/components/layout/page";
import { Button as ShadcnButton } from "@/components/ui/button";
import {
  paymentStateLabel,
  paymentStateVariant,
  StatusBadge,
} from "@/components/ui/status-badge";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatCurrencyAmount } from "@/lib/currency-utils";
import {
  listCustomerPayments,
  type CustomerPayment,
} from "@/lib/invoices-api";

const subNavTabs = [
  { id: "invoices", content: "Customer Invoices" },
  { id: "credit-notes", content: "Credit Notes" },
  { id: "payments", content: "Customer Payments" },
];

function paymentStateBadge(state: CustomerPayment["state"]) {
  return (
    <StatusBadge variant={paymentStateVariant(state)}>
      {paymentStateLabel(state)}
    </StatusBadge>
  );
}

export function CustomerPaymentsListPage() {
  const router = useRouter();
  const { formatOrgMoney, resolveCurrency } = useOrgCurrency();
  const [query, setQuery] = useState("");
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { mode, setMode } = useSetIndexFiltersMode(IndexFiltersMode.Filtering);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listCustomerPayments();
      setPayments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const filteredPayments = useMemo(() => {
    if (!query) return payments;
    const q = query.toLowerCase();
    return payments.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.partner.toLowerCase().includes(q) ||
        p.paymentMethod.toLowerCase().includes(q)
    );
  }, [payments, query]);

  const rowMarkup = filteredPayments.map((p, index) => (
    <IndexTable.Row id={p.id} key={p.id} position={index}>
      <IndexTable.Cell>{p.date}</IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" fontWeight="bold">
          {p.name}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{p.journal}</IndexTable.Cell>
      <IndexTable.Cell>{p.paymentMethod}</IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" tone="subdued">
          {p.bankAccountName ?? "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" fontWeight="semibold">
          {p.partner}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" tone={p.amountCurrency < 0 ? "subdued" : undefined}>
          {formatCurrencyAmount(
            p.amountCurrency,
            resolveCurrency(p.currencyId),
          )}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" fontWeight="bold">
          {formatOrgMoney(p.amount)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{paymentStateBadge(p.state)}</IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="150">
          <Button size="slim">View</Button>
          <Button size="slim">Edit</Button>
          <Button size="slim" tone="critical">Delete</Button>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <AppPage
      backAction={{ content: "Sales & Finance", url: "/dashboard/invoices" }}
      fullWidth
      primaryAction={{
        content: "+ New Payment Transaction",
        onAction: () => {},
      }}
      subtitle="Bank transactions, customer payment ledger, and manual payment reconciliations."
      title="Customer Payments"
    >
      <BlockStack gap="400">
        <InlineStack gap="200">
          <ShadcnButton
            variant="outline"
            size="sm"
            onClick={() => router.push("/dashboard/invoices")}
          >
            Customer Invoices
          </ShadcnButton>
          <ShadcnButton
            variant="outline"
            size="sm"
            onClick={() => router.push("/dashboard/invoices/credit-notes")}
          >
            Credit Notes
          </ShadcnButton>
          <ShadcnButton variant="secondary" size="sm">
            Customer Payments
          </ShadcnButton>
        </InlineStack>

        {error ? <Banner tone="critical">{error}</Banner> : null}

        <IndexSurface>
          <IndexFilters
            canCreateNewView={false}
            cancelAction={{ onAction: () => setQuery(""), disabled: false, loading: false }}
            filters={[]}
            mode={mode}
            queryPlaceholder="Search by partner name, transaction ID (e.g. PBANK/2026/22)..."
            queryValue={query}
            selected={2}
            tabs={subNavTabs}
            onClearAll={() => setQuery("")}
            onQueryChange={setQuery}
            onQueryClear={() => setQuery("")}
            onSelect={(idx) => {
              if (idx === 0) router.push("/dashboard/invoices");
              if (idx === 1) router.push("/dashboard/invoices/credit-notes");
            }}
            setMode={setMode}
          />

          <IndexTable
            headings={[
              { title: "Date" },
              { title: "Name" },
              { title: "Journal" },
              { title: "Payment Method" },
              { title: "Bank account" },
              { title: "Partner" },
              { title: "Amount (Currency)" },
              { title: "Amount" },
              { title: "State" },
              { title: "Actions" },
            ]}
            itemCount={filteredPayments.length}
            loading={loading}
            resourceName={{ singular: "payment", plural: "payments" }}
          >
            {rowMarkup}
          </IndexTable>
        </IndexSurface>
      </BlockStack>
    </AppPage>
  );
}
