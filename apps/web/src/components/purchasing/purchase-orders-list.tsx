"use client";

import {
  BlockStack,
  Button,
  EmptyState,
  IndexFilters,
  IndexFiltersMode,
  IndexTable,
  Link,
  Text,
  useSetIndexFiltersMode,
} from "@shopify/polaris";
import { ClipboardList, PackageCheck, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage, IndexSurface } from "@/components/layout/page";
import { formatMoney } from "@/components/sales/format-money";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  purchaseOrderStateLabel,
  purchaseOrderStateVariant,
  purchaseReceiptStatusLabel,
  purchaseReceiptStatusVariant,
  StatusBadge,
} from "@/components/ui/status-badge";
import { listPurchaseOrders, type PurchaseOrder } from "@/lib/purchase-orders-api";
import { useBranchLabels } from "@/hooks/use-branch-labels";

const tabs = [
  { id: "all", content: "All" },
  { id: "draft", content: "Draft" },
  { id: "confirmed", content: "Confirmed" },
  { id: "to_receive", content: "To receive" },
  { id: "received", content: "Received" },
] as const;

export function PurchaseOrdersListPage() {
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { mode, setMode } = useSetIndexFiltersMode(IndexFiltersMode.Filtering);
  const { showBranchColumn, branchLabel } = useBranchLabels();

  const activeTab = tabs[selectedTab]?.id ?? "all";

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const filters = useMemo(() => {
    if (activeTab === "draft") return { state: "draft" as const };
    if (activeTab === "confirmed") {
      return { state: "confirmed" as const };
    }
    if (activeTab === "to_receive") {
      return { state: "confirmed" as const, receiptStatus: "to_receive" as const };
    }
    if (activeTab === "received") {
      return { receiptStatus: "received" as const };
    }
    return {};
  }, [activeTab]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listPurchaseOrders({
        page,
        perPage: 16,
        search: debouncedQuery || undefined,
        ...filters,
        sortBy: "createdAt",
        sortDir: "desc",
      });
      setOrders(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, filters, page]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, activeTab]);

  const awaitingReceipt = orders.filter(
    (order) =>
      order.state === "confirmed" &&
      (order.receiptStatus === "to_receive" || order.receiptStatus === "partial"),
  ).length;

  const rowMarkup = orders.map((order, index) => (
    <IndexTable.Row id={order.id} key={order.id} position={index}>
      <IndexTable.Cell>
        <Link url={`/dashboard/purchasing/orders/${order.id}`}>
          <Text as="span" fontWeight="semibold">
            {order.number}
          </Text>
        </Link>
      </IndexTable.Cell>
      <IndexTable.Cell>{order.vendorName}</IndexTable.Cell>
      <IndexTable.Cell>{order.orderDate}</IndexTable.Cell>
      {showBranchColumn ? (
        <IndexTable.Cell>{branchLabel(order.branchId)}</IndexTable.Cell>
      ) : null}
      <IndexTable.Cell>
        <StatusBadge variant={purchaseOrderStateVariant(order.state)}>
          {purchaseOrderStateLabel(order.state)}
        </StatusBadge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <StatusBadge variant={purchaseReceiptStatusVariant(order.receiptStatus)}>
          {purchaseReceiptStatusLabel(order.receiptStatus)}
        </StatusBadge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {formatMoney(order.amountTotal, order.currencyCode)}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <AppPage
      fullWidth
      title="Purchase Orders"
      subtitle="Order stock from vendors and receive into inventory."
      primaryAction={{
        content: "New purchase order",
        url: "/dashboard/purchasing/orders/new",
      }}
      secondaryActions={[
        { content: "Vendors", url: "/dashboard/purchasing/vendors" },
        { content: "Receipts", url: "/dashboard/purchasing/receipts" },
      ]}
    >
      <BlockStack gap="400">
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard
            icon={<ClipboardList className="size-5" />}
            label="Purchase orders"
            value={String(total)}
            hint="all PO documents"
            loading={loading}
          />
          <KpiCard
            icon={<Truck className="size-5" />}
            label="Awaiting receipt (page)"
            value={String(awaitingReceipt)}
            hint="confirmed, not fully received"
            loading={loading}
          />
          <KpiCard
            icon={<PackageCheck className="size-5" />}
            label="On this page"
            value={String(orders.length)}
            hint="current list view"
            loading={loading}
          />
        </div>

        {error ? (
          <Text as="p" tone="critical">
            {error}
          </Text>
        ) : null}

        <IndexSurface>
          <IndexFilters
            appliedFilters={[]}
            canCreateNewView={false}
            cancelAction={{
              onAction: () => setQuery(""),
              disabled: false,
              loading: false,
            }}
            filters={[]}
            mode={mode}
            queryPlaceholder="Search PO number or reference"
            queryValue={query}
            selected={selectedTab}
            tabs={[...tabs]}
            onClearAll={() => setQuery("")}
            onQueryChange={setQuery}
            onQueryClear={() => setQuery("")}
            onSelect={setSelectedTab}
            setMode={setMode}
          />
          <IndexTable
            emptyState={
              <EmptyState
                action={{
                  content: "New purchase order",
                  onAction: () =>
                    router.push("/dashboard/purchasing/orders/new"),
                }}
                heading="No purchase orders"
                image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
              >
                <p>Create a purchase order to order stock from a vendor.</p>
              </EmptyState>
            }
            headings={[
              { title: "Number" },
              { title: "Vendor" },
              { title: "Order date" },
              ...(showBranchColumn ? [{ title: "Branch" }] : []),
              { title: "Status" },
              { title: "Receipt" },
              { title: "Total" },
            ]}
            itemCount={total}
            loading={loading}
            pagination={{
              hasNext: page * 16 < total,
              hasPrevious: page > 1,
              onNext: () => setPage((current) => current + 1),
              onPrevious: () => setPage((current) => Math.max(1, current - 1)),
            }}
            resourceName={{ singular: "purchase order", plural: "purchase orders" }}
          >
            {rowMarkup}
          </IndexTable>
        </IndexSurface>
      </BlockStack>
    </AppPage>
  );
}
