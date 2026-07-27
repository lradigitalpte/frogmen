"use client";

import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  IndexTable,
  InlineGrid,
  InlineStack,
  Layout,
  Link,
  SkeletonBodyText,
  Text,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { AdjustStockModal } from "@/components/stock/adjust-stock-modal";
import { QuickAddSerialModal } from "@/components/stock/quick-add-serial-modal";
import { listStock } from "@/lib/products-api";
import { archiveWarehouse, getWarehouse } from "@/lib/warehouses-api";
import type { StockOverviewRow } from "@/types/product";
import type { Warehouse } from "@/types/warehouse";

interface ViewWarehousePageProps {
  warehouseId: string;
}

function formatAddress(warehouse: Warehouse) {
  const lines = [
    warehouse.street1,
    [warehouse.city, warehouse.zip].filter(Boolean).join(" "),
    warehouse.countryCode,
  ].filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : " ";
}

export function ViewWarehousePage({ warehouseId }: ViewWarehousePageProps) {
  const router = useRouter();
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [stockRows, setStockRows] = useState<StockOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<StockOverviewRow | null>(null);
  const [serialTarget, setSerialTarget] = useState<StockOverviewRow | null>(null);

  const loadData = useCallback(async () => {
    const [warehouseData, stockResult] = await Promise.all([
      getWarehouse(warehouseId),
      listStock({ warehouseId, perPage: 100 }),
    ]);
    setWarehouse(warehouseData);
    setStockRows(stockResult.data);
  }, [warehouseId]);

  useEffect(() => {
    loadData()
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Warehouse not found"),
      )
      .finally(() => setLoading(false));
  }, [loadData]);

  async function handleArchive() {
    if (!warehouse) return;
    await archiveWarehouse(warehouse.id);
    router.push("/dashboard/inventory/warehouses");
  }

  if (loading) {
    return (
      <AppPage title="Warehouse">
        <SkeletonBodyText lines={6} />
      </AppPage>
    );
  }

  if (!warehouse || error) {
    return (
      <AppPage title="Warehouse not found">
        <Text as="p" tone="critical">
          {error ?? "Warehouse not found"}
        </Text>
      </AppPage>
    );
  }

  const totalUnits = stockRows.reduce(
    (sum, row) => sum + (Number(row.quantity) || 0),
    0,
  );

  const stockMarkup = stockRows.map((row, index) => (
    <IndexTable.Row
      id={`${row.productId}-${row.warehouseId}`}
      key={`${row.productId}-${row.warehouseId}`}
      position={index}
    >
      <IndexTable.Cell>
        <Link url={`/dashboard/inventory/products/${row.productId}`}>
          {row.productName}
        </Link>
      </IndexTable.Cell>
      <IndexTable.Cell>{row.productSku || " "}</IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" fontWeight="semibold">
          {row.quantity}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {row.trackSerial ? (
          <Button size="slim" onClick={() => setSerialTarget(row)}>
            + Add serial
          </Button>
        ) : (
          <Button size="slim" onClick={() => setAdjustTarget(row)}>
            Adjust
          </Button>
        )}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <AppPage
      backAction={{
        content: "Warehouses",
        url: "/dashboard/inventory/warehouses",
      }}
      primaryAction={{
        content: "Edit",
        url: `/dashboard/inventory/warehouses/${warehouse.id}/edit`,
      }}
      secondaryActions={[
        {
          content: "Archive",
          destructive: true,
          onAction: handleArchive,
        },
      ]}
      subtitle={warehouse.code}
      title={warehouse.name}
    >
      <BlockStack gap="500">
        <div className="frogmen-kpi-grid">
          <div className="frogmen-kpi-card">
            <div className="frogmen-kpi-header">
              <span className="frogmen-kpi-label">Products stocked</span>
            </div>
            <div className="frogmen-kpi-value">{stockRows.length}</div>
          </div>
          <div className="frogmen-kpi-card">
            <div className="frogmen-kpi-header">
              <span className="frogmen-kpi-label">Total units here</span>
            </div>
            <div className="frogmen-kpi-value">{totalUnits}</div>
          </div>
        </div>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Stock in this warehouse
                  </Text>
                  <Button url="/dashboard/inventory">View all stock</Button>
                </InlineStack>

                {stockRows.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No stock recorded in this warehouse yet.
                  </Text>
                ) : (
                  <div className="accounting-report-table">
                    <IndexTable
                      selectable={false}
                      itemCount={stockRows.length}
                      headings={[
                        { title: "Product" },
                        { title: "SKU" },
                        { title: "On hand" },
                        { title: "" },
                      ]}
                    >
                      {stockMarkup}
                    </IndexTable>
                  </div>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Location
                  </Text>
                  <Text as="p">{formatAddress(warehouse)}</Text>
                </BlockStack>
              </Card>
              <Card>
                <InlineGrid columns={2} gap="300">
                  <Box>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Code
                    </Text>
                    <Box paddingBlockStart="100">
                      <Badge>{warehouse.code}</Badge>
                    </Box>
                  </Box>
                  <Box>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Status
                    </Text>
                    <Box paddingBlockStart="100">
                      <Badge tone={warehouse.isActive ? "success" : undefined}>
                        {warehouse.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </Box>
                  </Box>
                </InlineGrid>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>

      {adjustTarget ? (
        <AdjustStockModal
          open
          productId={adjustTarget.productId}
          productName={adjustTarget.productName}
          warehouseId={adjustTarget.warehouseId}
          currentQuantity={adjustTarget.quantity}
          warehouses={[warehouse]}
          onClose={() => setAdjustTarget(null)}
          onSuccess={() => void loadData()}
        />
      ) : null}

      {serialTarget ? (
        <QuickAddSerialModal
          open
          productId={serialTarget.productId}
          productName={serialTarget.productName}
          warehouseId={serialTarget.warehouseId}
          warehouses={[warehouse]}
          onClose={() => setSerialTarget(null)}
          onSuccess={() => void loadData()}
        />
      ) : null}
    </AppPage>
  );
}
