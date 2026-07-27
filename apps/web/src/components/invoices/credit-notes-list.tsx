"use client";

import {
  Banner,
  BlockStack,
  Button,
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
import { StatusBadge } from "@/components/ui/status-badge";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatCurrencyAmount } from "@/lib/currency-utils";
import {
  listCreditNotes,
  type CreditNote,
} from "@/lib/invoices-api";

const subNavTabs = [
  { id: "invoices", content: "Customer Invoices" },
  { id: "credit-notes", content: "Credit Notes" },
  { id: "payments", content: "Customer Payments" },
];

export function CreditNotesListPage() {
  const router = useRouter();
  const { formatOrgMoney, resolveCurrency } = useOrgCurrency();
  const [query, setQuery] = useState("");
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { mode, setMode } = useSetIndexFiltersMode(IndexFiltersMode.Filtering);

  const loadCreditNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listCreditNotes();
      setCreditNotes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load credit notes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCreditNotes();
  }, [loadCreditNotes]);

  const filtered = useMemo(() => {
    if (!query) return creditNotes;
    const q = query.toLowerCase();
    return creditNotes.filter(
      (cn) =>
        cn.number.toLowerCase().includes(q) ||
        cn.customerName.toLowerCase().includes(q) ||
        cn.reason.toLowerCase().includes(q)
    );
  }, [creditNotes, query]);

  const rowMarkup = filtered.map((cn, index) => (
    <IndexTable.Row id={cn.id} key={cn.id} position={index}>
      <IndexTable.Cell>
        <Text as="span" fontWeight="bold">
          {cn.number}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{cn.invoiceNumber}</IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" fontWeight="semibold">
          {cn.customerName}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{cn.date}</IndexTable.Cell>
      <IndexTable.Cell>{cn.reason}</IndexTable.Cell>
      <IndexTable.Cell>
        <StatusBadge variant="success">Posted</StatusBadge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" fontWeight="bold" alignment="end">
          {cn.currencyId
            ? formatCurrencyAmount(cn.amount, resolveCurrency(cn.currencyId))
            : formatOrgMoney(cn.amount)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="150">
          <Button
            size="slim"
            onClick={() => window.open(`/api/v1/credit-notes/${cn.id}/document.pdf`, "_blank")}
          >
            View PDF
          </Button>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <AppPage
      backAction={{ content: "Invoices", url: "/dashboard/invoices" }}
      fullWidth
      primaryAction={{
        content: "+ New Credit Note",
        onAction: () => {},
      }}
      subtitle="Customer refunds, warranty allowances, and credit note adjustments."
      title="Credit Notes"
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
          <ShadcnButton variant="secondary" size="sm">
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

        {error ? <Banner tone="critical">{error}</Banner> : null}

        <IndexSurface>
          <IndexFilters
            canCreateNewView={false}
            cancelAction={{ onAction: () => setQuery(""), disabled: false, loading: false }}
            filters={[]}
            mode={mode}
            queryPlaceholder="Search credit notes by number, customer, or reason..."
            queryValue={query}
            selected={1}
            tabs={subNavTabs}
            onClearAll={() => setQuery("")}
            onQueryChange={setQuery}
            onQueryClear={() => setQuery("")}
            onSelect={(idx) => {
              if (idx === 0) router.push("/dashboard/invoices");
              if (idx === 2) router.push("/dashboard/invoices/payments");
            }}
            setMode={setMode}
          />

          <IndexTable
            headings={[
              { title: "Credit Note Number" },
              { title: "Invoice Ref" },
              { title: "Customer Account" },
              { title: "Date" },
              { title: "Reason" },
              { title: "Status" },
              { title: "Amount", alignment: "end" },
              { title: "Actions" },
            ]}
            itemCount={filtered.length}
            loading={loading}
            resourceName={{ singular: "credit note", plural: "credit notes" }}
          >
            {rowMarkup}
          </IndexTable>
        </IndexSurface>
      </BlockStack>
    </AppPage>
  );
}
