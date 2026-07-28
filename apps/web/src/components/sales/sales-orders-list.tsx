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
import { Calculator, FileCheck, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage, IndexSurface } from "@/components/layout/page";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  orderInvoiceStatusLabel,
  orderInvoiceStatusVariant,
  StatusBadge,
} from "@/components/ui/status-badge";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatCurrencyAmount } from "@/lib/currency-utils";
import {
  listQuotations,
  type Quotation,
} from "@/lib/quotations-api";

const tabs = [
  { id: "confirmed", content: "All Sales Orders" },
  { id: "to_invoice", content: "Orders To Invoice" },
  { id: "invoiced", content: "Fully Invoiced" },
];

function formatCurrency(
  amountStr: string,
  currencyCode: string | undefined,
  formatOrgMoney: (amount: string | number) => string,
) {
  if (currencyCode) {
    return formatCurrencyAmount(amountStr, { code: currencyCode, decimalPlaces: 2, symbol: "" });
  }

  return formatOrgMoney(amountStr);
}

function invoiceStatusBadge(order: Quotation) {
  return (
    <StatusBadge variant={orderInvoiceStatusVariant(order.invoiceStatus)}>
      {orderInvoiceStatusLabel(order.invoiceStatus)}
    </StatusBadge>
  );
}

export function SalesOrdersListPage() {
  const router = useRouter();
  const { formatOrgMoney, formatBaseMoney } = useOrgCurrency();
  const [selectedTab, setSelectedTab] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<Quotation[]>([]);
  const [total, setTotal] = useState(0);
  const [toInvoiceCount, setToInvoiceCount] = useState(0);
  const [invoicedCount, setInvoicedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const { mode, setMode } = useSetIndexFiltersMode(IndexFiltersMode.Filtering);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const invoiceStatusFilter = useMemo(() => {
    if (selectedTab === 1) return "to_invoice" as const;
    if (selectedTab === 2) return "invoiced" as const;
    return undefined;
  }, [selectedTab]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listQuotations({
        page,
        perPage: 16,
        search: debouncedQuery || undefined,
        state: "confirmed",
        invoiceStatus: invoiceStatusFilter,
        sortBy: "quoteDate",
        sortDir: "desc",
      });

      setOrders(result.data);
      setTotal(result.meta.total);
      setToInvoiceCount(result.meta.toInvoiceCount ?? 0);
      setInvoicedCount(result.meta.invoicedCount ?? 0);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load sales orders",
      );
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, invoiceStatusFilter, page]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, selectedTab]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const emptyState = useMemo(
    () => (
      <EmptyState
        action={{
          content: "View Quotations",
          onAction: () => router.push("/dashboard/sales/quotations"),
        }}
        heading="No confirmed sales orders found"
        image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
      >
        <p>Confirm draft quotations to promote them into confirmed sales orders.</p>
      </EmptyState>
    ),
    [router],
  );

  const totalOrderValue = useMemo(() => {
    return orders.reduce(
      (sum, q) => sum + (parseFloat(q.amountTotalBase ?? "0") || 0),
      0,
    );
  }, [orders]);

  const rowMarkup = orders.map((order, index) => {
    const viewHref = `/dashboard/sales/quotations/${order.id}`;

    return (
      <IndexTable.Row id={order.id} key={order.id} position={index}>
        <IndexTable.Cell>
          <Link url={viewHref}>
            <Text as="span" fontWeight="bold">
              {order.number}
            </Text>
          </Link>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="050">
            <Text as="span" fontWeight="semibold">
              {order.customerName ?? "Customer"}
            </Text>
            <Text as="span" tone="subdued" variant="bodySm">
              Ref: {order.customerReference || "Not provided"}
            </Text>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>{order.quoteDate}</IndexTable.Cell>
        <IndexTable.Cell>
          <StatusBadge variant="success">Confirmed Order</StatusBadge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {invoiceStatusBadge(order)}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" fontWeight="bold" alignment="end">
            {formatCurrency(order.amountTotal, order.currencyCode, formatOrgMoney)}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="150" blockAlign="center">
            <Button
              size="slim"
              variant="primary"
              onClick={() =>
                order.invoiceStatus === "invoiced"
                  ? router.push(viewHref)
                  : router.push(`/dashboard/invoices/new?quotationId=${order.id}`)
              }
            >
              {order.invoiceStatus === "invoiced" ? "View Order" : "Create Invoice"}
            </Button>
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <AppPage
      backAction={{ content: "Home", url: "/dashboard" }}
      fullWidth
      primaryAction={{
        content: "+ New Sales Quotation",
        onAction: () => router.push("/dashboard/sales/quotations/new"),
      }}
      subtitle="Confirmed sales orders ready for delivery, fulfillment, and customer invoicing."
      title="Sales Orders"
    >
      <BlockStack gap="400">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            icon={<ShoppingCart className="size-5" />}
            label="Confirmed Sales Orders Value"
            value={formatBaseMoney(totalOrderValue)}
            hint="Total confirmed revenue"
            tone="default"
            loading={loading}
          />
          <KpiCard
            icon={<FileCheck className="size-5" />}
            label="Orders to Invoice"
            value={`${toInvoiceCount} orders`}
            hint={`${invoicedCount} already invoiced`}
            tone="warning"
            loading={loading}
          />
          <KpiCard
            icon={<Calculator className="size-5" />}
            label="Average Order Value"
            value={formatBaseMoney(totalOrderValue / (orders.length || 1))}
            hint="Per commercial order"
            tone="success"
            loading={loading}
          />
        </div>

        {actionSuccess ? (
          <Banner tone="success" onDismiss={() => setActionSuccess(null)}>
            {actionSuccess}
          </Banner>
        ) : null}

        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <IndexSurface>
          <IndexFilters
            canCreateNewView={false}
            cancelAction={{
              onAction: () => setQuery(""),
              disabled: false,
              loading: false,
            }}
            filters={[]}
            mode={mode}
            queryPlaceholder="Search sales orders by number, customer, or reference..."
            queryValue={query}
            selected={selectedTab}
            tabs={tabs}
            onClearAll={() => setQuery("")}
            onQueryChange={setQuery}
            onQueryClear={() => setQuery("")}
            onSelect={setSelectedTab}
            setMode={setMode}
          />

          <IndexTable
            emptyState={emptyState}
            headings={[
              { title: "Order Number" },
              { title: "Customer Account" },
              { title: "Date" },
              { title: "Order Status" },
              { title: "Invoice Status" },
              { title: "Total Amount", alignment: "end" },
              { title: "Actions" },
            ]}
            itemCount={total}
            loading={loading}
            pagination={{
              hasNext: page * 16 < total,
              hasPrevious: page > 1,
              onNext: () => setPage((current) => current + 1),
              onPrevious: () => setPage((current) => Math.max(1, current - 1)),
            }}
            resourceName={{ singular: "sales order", plural: "sales orders" }}
          >
            {rowMarkup}
          </IndexTable>
        </IndexSurface>
      </BlockStack>
    </AppPage>
  );
}
