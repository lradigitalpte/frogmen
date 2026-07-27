"use client";

import {
  BlockStack,
  EmptyState,
  IndexTable,
  Link,
  Text,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppPage, IndexSurface } from "@/components/layout/page";
import { StatusBadge } from "@/components/ui/status-badge";
import { listGoodsReceipts, type GoodsReceipt } from "@/lib/purchase-orders-api";

export function GoodsReceiptsListPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listGoodsReceipts({ page, perPage: 16 });
      setReceipts(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load receipts");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void loadReceipts();
  }, [loadReceipts]);

  const rowMarkup = receipts.map((receipt, index) => (
    <IndexTable.Row id={receipt.id} key={receipt.id} position={index}>
      <IndexTable.Cell>
        <Link url={`/dashboard/purchasing/receipts/${receipt.id}`}>
          <Text as="span" fontWeight="semibold">
            {receipt.number}
          </Text>
        </Link>
      </IndexTable.Cell>
      <IndexTable.Cell>{receipt.purchaseOrderNumber}</IndexTable.Cell>
      <IndexTable.Cell>{receipt.vendorName}</IndexTable.Cell>
      <IndexTable.Cell>{receipt.receiptDate}</IndexTable.Cell>
      <IndexTable.Cell>
        <StatusBadge variant={receipt.state === "done" ? "success" : "neutral"}>
          {receipt.state}
        </StatusBadge>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <AppPage
      fullWidth
      title="Goods Receipts"
      subtitle="Inbound receipts that increase stock."
      backAction={{ content: "Purchase orders", url: "/dashboard/purchasing/orders" }}
    >
      <BlockStack gap="400">
        {error ? (
          <Text as="p" tone="critical">
            {error}
          </Text>
        ) : null}

        <IndexSurface>
          <IndexTable
            emptyState={
              <EmptyState
                action={{
                  content: "View purchase orders",
                  onAction: () =>
                    router.push("/dashboard/purchasing/orders"),
                }}
                heading="No receipts yet"
                image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
              >
                <p>Receive products from a confirmed purchase order.</p>
              </EmptyState>
            }
            headings={[
              { title: "Receipt" },
              { title: "PO" },
              { title: "Vendor" },
              { title: "Date" },
              { title: "Status" },
            ]}
            itemCount={total}
            loading={loading}
            pagination={{
              hasNext: page * 16 < total,
              hasPrevious: page > 1,
              onNext: () => setPage((current) => current + 1),
              onPrevious: () => setPage((current) => Math.max(1, current - 1)),
            }}
            resourceName={{ singular: "receipt", plural: "receipts" }}
          >
            {rowMarkup}
          </IndexTable>
        </IndexSurface>
      </BlockStack>
    </AppPage>
  );
}
