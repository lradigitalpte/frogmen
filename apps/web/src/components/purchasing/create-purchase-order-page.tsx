"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  Tabs,
  Text,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { AddPurchaseOrderLineModal } from "@/components/purchasing/add-purchase-order-line-modal";
import { PurchaseOrderContextCard } from "@/components/purchasing/purchase-order-context-card";
import {
  PurchaseOrderHeaderForm,
  type PurchaseOrderHeaderValues,
} from "@/components/purchasing/purchase-order-header-form";
import {
  PurchaseOrderDraftLinesTable,
  type PurchaseOrderDraftLine,
} from "@/components/purchasing/purchase-order-draft-lines-table";
import { todayIsoDate } from "@/components/sales/format-money";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { listProducts } from "@/lib/products-api";
import { listWarehouses } from "@/lib/warehouses-api";
import {
  addPurchaseOrderLine,
  createPurchaseOrder,
} from "@/lib/purchase-orders-api";
import type { Product } from "@/types/product";
import type { Warehouse } from "@/types/warehouse";
import { useToast } from "@/components/providers/toast-provider";

const pageTabs = [
  { id: "details", content: "Vendor & details" },
  { id: "lines", content: "Products" },
];

function emptyHeader(): PurchaseOrderHeaderValues {
  return {
    vendor: null,
    currencyId: "",
    orderDate: todayIsoDate(),
    expectedDate: "",
    vendorReference: "",
    internalReference: "",
    notes: "",
  };
}

export function CreatePurchaseOrderPage() {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const {
    currencies,
    baseCurrency,
    loading: currenciesLoading,
    error: currenciesError,
  } = useOrgCurrency();
  const [selectedTab, setSelectedTab] = useState(0);
  const [header, setHeader] = useState<PurchaseOrderHeaderValues>(emptyHeader);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [lines, setLines] = useState<PurchaseOrderDraftLine[]>([]);
  const [lineModalOpen, setLineModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!baseCurrency?.id) return;
    setHeader((current) =>
      current.currencyId ? current : { ...current, currencyId: baseCurrency.id },
    );
  }, [baseCurrency?.id]);

  useEffect(() => {
    void listProducts({ perPage: 100 })
      .then((productRows) => {
        setProducts(
          productRows.data.filter(
            (product) => product.isStorable && product.type !== "service",
          ),
        );
      })
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    void listWarehouses({ perPage: 100 })
      .then((warehouseRows) => setWarehouses(warehouseRows.data))
      .catch(() => setWarehouses([]));
  }, []);

  const currency = useMemo(
    () => currencies.find((item) => item.id === header.currencyId),
    [currencies, header.currencyId],
  );

  const orderTotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [lines],
  );

  const unitCount = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity, 0),
    [lines],
  );

  const warehouseCount = useMemo(
    () => new Set(lines.map((line) => line.warehouseId)).size,
    [lines],
  );

  function addLine(input: Omit<PurchaseOrderDraftLine, "id">) {
    setLines((current) => [...current, { ...input, id: crypto.randomUUID() }]);
  }

  function removeLine(lineId: string) {
    setLines((current) => current.filter((line) => line.id !== lineId));
  }

  function validateHeader(): string | null {
    if (!header.vendor) return "Select a vendor first.";
    if (!header.currencyId) return "Select a currency.";
    return null;
  }

  async function handleCreate() {
    const headerError = validateHeader();
    if (headerError) {
      setError(headerError);
      showError(headerError);
      setSelectedTab(0);
      return;
    }
    if (lines.length === 0) {
      const message = "Add at least one product before creating the PO.";
      setError(message);
      showError(message);
      setSelectedTab(1);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const order = await createPurchaseOrder({
        vendorId: header.vendor!.id,
        currencyId: header.currencyId,
        orderDate: header.orderDate,
        expectedDate: header.expectedDate || undefined,
        vendorReference: header.vendorReference || undefined,
        internalReference: header.internalReference || undefined,
        notes: header.notes || undefined,
      });

      for (const line of lines) {
        await addPurchaseOrderLine(order.id, {
          productId: line.productId,
          warehouseId: line.warehouseId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        });
      }

      showSuccess(`Purchase order ${order.number} created.`);
      router.push(`/dashboard/purchasing/orders/${order.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create purchase order";
      setError(message);
      showError(message);
      setSaving(false);
    }
  }

  function goToProducts() {
    const headerError = validateHeader();
    if (headerError) {
      setError(headerError);
      return;
    }
    setError(null);
    setSelectedTab(1);
  }

  return (
    <AppPage
      backAction={{
        content: "Purchase orders",
        url: "/dashboard/purchasing/orders",
      }}
      primaryAction={{
        content:
          selectedTab === 0 ? "Next: Add products" : "Create purchase order",
        loading: saving,
        onAction: () => {
          if (selectedTab === 0) {
            goToProducts();
            return;
          }
          void handleCreate();
        },
      }}
      secondaryActions={[
        ...(selectedTab > 0
          ? [
              {
                content: "Back to details",
                onAction: () => setSelectedTab(0),
              },
            ]
          : []),
        {
          content: "Cancel",
          onAction: () => router.push("/dashboard/purchasing/orders"),
        },
      ]}
      subtitle="Order stock from a vendor and receive into your warehouses."
      title="New Purchase Order"
      titleMetadata={<Badge>Draft</Badge>}
    >
      <BlockStack gap="500">
        <InlineStack align="space-between" blockAlign="center">
          <Tabs selected={selectedTab} tabs={pageTabs} onSelect={setSelectedTab} />
          {selectedTab === 1 ? (
            <Button variant="primary" onClick={() => setLineModalOpen(true)}>
              Add product line
            </Button>
          ) : null}
        </InlineStack>

        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        {currenciesError ? (
          <Banner tone="warning">
            Could not load currencies: {currenciesError}. Check Settings →
            Currencies or refresh the page.
          </Banner>
        ) : null}

        {selectedTab === 0 ? (
          <Layout>
            <Layout.Section>
              <PurchaseOrderHeaderForm
                currencies={currencies}
                currenciesError={currenciesError}
                currenciesLoading={currenciesLoading}
                errors={
                  currencies.length === 0 && !currenciesLoading
                    ? { currencyId: "No currencies available" }
                    : undefined
                }
                onChange={setHeader}
                values={header}
              />
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                <PurchaseOrderContextCard
                  currencyCode={currency?.code}
                  expectedDate={header.expectedDate}
                  orderDate={header.orderDate}
                  vendorName={header.vendor?.name}
                />
                <Button fullWidth variant="primary" onClick={goToProducts}>
                  Next: Add products
                </Button>
              </BlockStack>
            </Layout.Section>
          </Layout>
        ) : null}

        {selectedTab === 1 ? (
          <Layout>
            <Layout.Section>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Products to receive
                  </Text>
                  <Text as="p" tone="subdued">
                    {lines.length === 0
                      ? "Add products with quantity, unit cost, and destination warehouse."
                      : `${lines.length} line${lines.length === 1 ? "" : "s"} · ${unitCount} unit${unitCount === 1 ? "" : "s"} · ${warehouseCount} warehouse${warehouseCount === 1 ? "" : "s"}`}
                  </Text>
                </BlockStack>

                <Card padding="0">
                  <PurchaseOrderDraftLinesTable
                    currencyCode={currency?.code}
                    lines={lines}
                    onRemove={removeLine}
                  />
                </Card>
              </BlockStack>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                <PurchaseOrderContextCard
                  currencyCode={currency?.code}
                  expectedDate={header.expectedDate}
                  lineCount={lines.length}
                  orderDate={header.orderDate}
                  orderTotal={orderTotal}
                  showTotal
                  unitCount={unitCount}
                  vendorName={header.vendor?.name}
                />
                <Button
                  fullWidth
                  loading={saving}
                  variant="primary"
                  onClick={() => void handleCreate()}
                >
                  Create purchase order
                </Button>
              </BlockStack>
            </Layout.Section>
          </Layout>
        ) : null}
      </BlockStack>

      <AddPurchaseOrderLineModal
        currencyCode={currency?.code}
        documentCurrencyId={header.currencyId}
        open={lineModalOpen}
        products={products}
        warehouses={warehouses}
        onAdd={addLine}
        onClose={() => setLineModalOpen(false)}
      />
    </AppPage>
  );
}
