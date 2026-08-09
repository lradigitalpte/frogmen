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
import {
  PurchaseOrderAdditionalChargesForm,
  PurchaseOrderFreightForm,
} from "@/components/purchasing/purchase-order-charges-form";
import { PurchaseOrderContextCard } from "@/components/purchasing/purchase-order-context-card";
import { PurchaseOrderVendorTermsForm } from "@/components/purchasing/purchase-order-vendor-terms-form";
import {
  PurchaseOrderDraftLinesTable,
  type PurchaseOrderDraftLine,
} from "@/components/purchasing/purchase-order-draft-lines-table";
import {
  PurchaseOrderHeaderForm,
  type PurchaseOrderHeaderValues,
} from "@/components/purchasing/purchase-order-header-form";
import { PurchaseOrderMarginPreview } from "@/components/purchasing/purchase-order-margin-preview";
import { PurchaseOrderStepBanner } from "@/components/purchasing/purchase-order-step-banner";
import {
  PurchaseOrderTotalsSummary,
  type PurchaseOrderChargeBreakdownItem,
} from "@/components/purchasing/purchase-order-totals-summary";
import { Package, ShoppingCart } from "lucide-react";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { listProducts } from "@/lib/products-api";
import {
  buildPurchaseOrderChargesPayload,
  chargesFromPurchaseOrder,
  computePurchaseOrderTotals,
  emptyPurchaseOrderCharges,
  type PurchaseOrderChargeValues,
} from "@/lib/purchase-order-utils";
import {
  addPurchaseOrderLine,
  deletePurchaseOrderLine,
  getPurchaseOrder,
  updatePurchaseOrder,
  updatePurchaseOrderLine,
} from "@/lib/purchase-orders-api";
import { listWarehouses } from "@/lib/warehouses-api";
import type { Product } from "@/types/product";
import type { Vendor } from "@/types/vendor";
import type { Warehouse } from "@/types/warehouse";
import { useToast } from "@/components/providers/toast-provider";

const pageTabs = [
  { id: "details", content: "Vendor & details" },
  { id: "lines", content: "Products & charges" },
];

function lineFromOrderLine(
  line: NonNullable<Awaited<ReturnType<typeof getPurchaseOrder>>["lines"]>[number],
  sellingPrice?: number | null,
): PurchaseOrderDraftLine {
  return {
    id: line.id,
    productId: line.productId ?? "",
    warehouseId: line.warehouseId ?? "",
    description: line.description,
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
    productName: line.productName ?? line.description,
    productSku: line.productSku,
    sellingPrice,
    warehouseName: line.warehouseName ?? "",
  };
}

export function EditPurchaseOrderPage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const {
    currencies,
    loading: currenciesLoading,
    error: currenciesError,
  } = useOrgCurrency();
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState(0);
  const [orderNumber, setOrderNumber] = useState("");
  const [header, setHeader] = useState<PurchaseOrderHeaderValues>({
    vendor: null,
    currencyId: "",
    orderDate: "",
    expectedDate: "",
    vendorReference: "",
    internalReference: "",
  });
  const [vendorNotes, setVendorNotes] = useState("");
  const [charges, setCharges] = useState<PurchaseOrderChargeValues>(
    emptyPurchaseOrderCharges(),
  );
  const [originalLineIds, setOriginalLineIds] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [lines, setLines] = useState<PurchaseOrderDraftLine[]>([]);
  const [lineModalOpen, setLineModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([
      listProducts({ perPage: 100 }),
      listWarehouses({ perPage: 100 }),
      getPurchaseOrder(orderId),
    ])
      .then(([productRows, warehouseRows, order]) => {
        if (order.state !== "draft") {
          router.replace(`/dashboard/purchasing/orders/${orderId}`);
          return;
        }

        const productMap = new Map(
          productRows.data.map((product) => [product.id, product]),
        );
        const storableProducts = productRows.data.filter(
          (product) => product.isStorable && product.type !== "service",
        );

        setProducts(storableProducts);
        setWarehouses(warehouseRows.data);
        setOrderNumber(order.number);
        setHeader({
          vendor: {
            id: order.vendorId,
            name: order.vendorName ?? "Vendor",
          } as Vendor,
          currencyId: order.currencyId,
          orderDate: order.orderDate,
          expectedDate: order.expectedDate ?? "",
          vendorReference: order.vendorReference ?? "",
          internalReference: order.internalReference ?? "",
        });
        setVendorNotes(order.notes ?? "");
        setCharges(chargesFromPurchaseOrder(order));
        const mappedLines = (order.lines ?? []).map((line) =>
          lineFromOrderLine(
            line,
            line.productId
              ? Number(productMap.get(line.productId)?.sellingPrice ?? NaN) ||
                null
              : null,
          ),
        );
        setLines(mappedLines);
        setOriginalLineIds(mappedLines.map((line) => line.id));
        setError(null);
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load purchase order",
        );
      })
      .finally(() => setLoading(false));
  }, [orderId, router]);

  const currency = useMemo(
    () => currencies.find((item) => item.id === header.currencyId),
    [currencies, header.currencyId],
  );

  const chargesPayload = useMemo(
    () => buildPurchaseOrderChargesPayload(charges),
    [charges],
  );

  const totals = useMemo(
    () =>
      computePurchaseOrderTotals(
        lines.map((line) => ({
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
        chargesPayload,
      ),
    [lines, chargesPayload],
  );

  const marginLines = useMemo(
    () =>
      lines.map((line) => ({
        id: line.id,
        productName: line.productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        sellingPrice: line.sellingPrice,
      })),
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

  const chargeLineOptions = useMemo(
    () =>
      lines.map((line) => ({
        id: line.id,
        label: `${line.productName}${line.productSku ? ` (${line.productSku})` : ""}`,
      })),
    [lines],
  );

  const chargeBreakdown = useMemo((): PurchaseOrderChargeBreakdownItem[] => {
    return charges.additionalCharges
      .map((charge) => {
        const amount = Number(charge.amount);
        const name = charge.name.trim();
        if (!name || !Number.isFinite(amount) || amount <= 0) {
          return null;
        }

        const lineLabel = chargeLineOptions.find(
          (line) => line.id === charge.purchaseOrderLineId,
        )?.label;

        return {
          name,
          amount,
          scopeLabel:
            charge.scope === "line"
              ? lineLabel ?? "Product line"
              : "Whole order",
        };
      })
      .filter(Boolean) as PurchaseOrderChargeBreakdownItem[];
  }, [chargeLineOptions, charges.additionalCharges]);

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

  async function handleSave() {
    const headerError = validateHeader();
    if (headerError) {
      setError(headerError);
      showError(headerError);
      setSelectedTab(0);
      return;
    }
    if (lines.length === 0) {
      const message = "Add at least one product before saving.";
      setError(message);
      showError(message);
      setSelectedTab(1);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updatePurchaseOrder(orderId, {
        vendorId: header.vendor!.id,
        currencyId: header.currencyId,
        orderDate: header.orderDate,
        expectedDate: header.expectedDate || null,
        vendorReference: header.vendorReference || null,
        internalReference: header.internalReference || null,
        notes: vendorNotes || null,
        ...chargesPayload,
      });

      const currentLineIds = new Set(lines.map((line) => line.id));
      for (const lineId of originalLineIds) {
        if (!currentLineIds.has(lineId)) {
          await deletePurchaseOrderLine(orderId, lineId);
        }
      }

      for (const line of lines) {
        if (originalLineIds.includes(line.id)) {
          await updatePurchaseOrderLine(orderId, line.id, {
            warehouseId: line.warehouseId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          });
        } else {
          await addPurchaseOrderLine(orderId, {
            productId: line.productId,
            warehouseId: line.warehouseId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          });
        }
      }

      showSuccess(`Purchase order ${orderNumber} updated.`);
      router.push(`/dashboard/purchasing/orders/${orderId}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update purchase order";
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

  if (loading) {
    return (
      <AppPage
        backAction={{ url: `/dashboard/purchasing/orders/${orderId}` }}
        title="Edit purchase order"
      >
        <Text as="p" tone="subdued">
          Loading purchase order…
        </Text>
      </AppPage>
    );
  }

  return (
    <AppPage
      backAction={{
        content: orderNumber || "Purchase order",
        url: `/dashboard/purchasing/orders/${orderId}`,
      }}
      primaryAction={{
        content: selectedTab === 0 ? "Next: Products" : "Save changes",
        loading: saving,
        onAction: () => {
          if (selectedTab === 0) {
            goToProducts();
            return;
          }
          void handleSave();
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
          onAction: () => router.push(`/dashboard/purchasing/orders/${orderId}`),
        },
      ]}
      subtitle="Update vendor details, charges, and product lines."
      title={`Edit ${orderNumber}`}
      titleMetadata={<Badge>Draft</Badge>}
    >
      <BlockStack gap="500">
        <div className="purchase-order-form-shell">
          <BlockStack gap="400">
            <PurchaseOrderStepBanner
              description={
                selectedTab === 0
                  ? "Update vendor, terms, freight, and target margin."
                  : "Add products, assign named charges, then review margin."
              }
              icon={selectedTab === 0 ? ShoppingCart : Package}
              title={
                selectedTab === 0
                  ? "Step 1 · Vendor & costing"
                  : "Step 2 · Products & margin"
              }
            />

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
              <BlockStack gap="400">
                <PurchaseOrderHeaderForm
                  currencies={currencies}
                  currenciesError={currenciesError}
                  currenciesLoading={currenciesLoading}
                  onChange={setHeader}
                  values={header}
                />
                <PurchaseOrderVendorTermsForm
                  notes={vendorNotes}
                  onChange={setVendorNotes}
                />
                <PurchaseOrderFreightForm
                  currency={currency}
                  onChange={setCharges}
                  values={charges}
                />
              </BlockStack>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                <PurchaseOrderContextCard
                  currencyCode={currency?.code}
                  expectedDate={header.expectedDate}
                  orderDate={header.orderDate}
                  vendorName={header.vendor?.name}
                />
                <PurchaseOrderTotalsSummary
                  chargeBreakdown={chargeBreakdown}
                  currencyCode={currency?.code}
                  {...totals}
                />
                <Button fullWidth variant="primary" onClick={goToProducts}>
                  Next: Products & charges
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

                <PurchaseOrderAdditionalChargesForm
                  currency={currency}
                  lineOptions={chargeLineOptions}
                  onChange={setCharges}
                  values={charges}
                />

                <PurchaseOrderMarginPreview
                  charges={chargesPayload}
                  currencyCode={currency?.code}
                  lines={marginLines}
                />
              </BlockStack>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                <PurchaseOrderContextCard
                  currencyCode={currency?.code}
                  expectedDate={header.expectedDate}
                  lineCount={lines.length}
                  orderDate={header.orderDate}
                  orderTotal={totals.amountTotal}
                  showTotal
                  unitCount={unitCount}
                  vendorName={header.vendor?.name}
                />
                <PurchaseOrderTotalsSummary
                  chargeBreakdown={chargeBreakdown}
                  currencyCode={currency?.code}
                  {...totals}
                />
                <Button
                  fullWidth
                  loading={saving}
                  variant="primary"
                  onClick={() => void handleSave()}
                >
                  Save changes
                </Button>
              </BlockStack>
            </Layout.Section>
          </Layout>
        ) : null}
          </BlockStack>
        </div>
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
