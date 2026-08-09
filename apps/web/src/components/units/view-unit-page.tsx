"use client";

import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  IndexTable,
  InlineStack,
  Link,
  SkeletonBodyText,
  Text,
} from "@shopify/polaris";
import { ArrowRight, Cpu, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { ProductUnitCostBreakdownCard } from "@/components/units/product-unit-cost-breakdown";
import { ProductUnitCostHistoryCard } from "@/components/units/product-unit-cost-history";
import {
  productUnitStatusLabel,
  productUnitStatusVariant,
  StatusBadge,
} from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { formatMarginPercent } from "@/lib/line-item-utils";
import { formatMoney } from "@/components/sales/format-money";
import { useCanViewCost } from "@/hooks/use-can-view-cost";
import {
  getProduct,
  getProductUnit,
  linkProductUnit,
  listProductUnits,
  unlinkProductUnit,
} from "@/lib/products-api";
import { listWarranties, type WarrantyRegistration } from "@/lib/warranty-api";
import type { ProductUnit, ProductUnitDetail } from "@/types/product";

interface ViewUnitPageProps {
  unitId: string;
}

interface ParentCandidate {
  id: string;
  serialNumber: string;
  productName: string;
  warehouseName?: string;
  status: ProductUnit["status"];
}

export function ViewUnitPage({ unitId }: ViewUnitPageProps) {
  const router = useRouter();
  const { canViewCost } = useCanViewCost();
  const [unit, setUnit] = useState<ProductUnitDetail | null>(null);
  const [parentCandidates, setParentCandidates] = useState<ParentCandidate[]>(
    [],
  );
  const [selectedParentId, setSelectedParentId] = useState("");
  const [linking, setLinking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unitWarranty, setUnitWarranty] = useState<WarrantyRegistration | null>(
    null,
  );

  async function refreshUnit() {
    const refreshed = await getProductUnit(unitId);
    setUnit(refreshed);
    return refreshed;
  }

  useEffect(() => {
    getProductUnit(unitId)
      .then(async (data) => {
        setUnit(data);

        if (data.status === "sold") {
          try {
            const warranties = await listWarranties({
              productUnitId: data.id,
              perPage: 1,
            });
            setUnitWarranty(warranties.data[0] ?? null);
          } catch {
            setUnitWarranty(null);
          }
        } else {
          setUnitWarranty(null);
        }

        if (!data.parentUnit) {
          const product = await getProduct(data.productId);
          const parentProductId = product.parent?.id;

          if (parentProductId) {
            const parentUnits = await listProductUnits(parentProductId, {
              perPage: 100,
            });
            setParentCandidates(
              parentUnits.data
                .filter((item) => !item.parentUnitId)
                .map((item) => ({
                  id: item.id,
                  serialNumber: item.serialNumber,
                  productName: product.parent?.name ?? "Main product",
                  warehouseName: item.warehouseName,
                  status: item.status,
                })),
            );
          }
        }
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Unit not found"),
      )
      .finally(() => setLoading(false));
  }, [unitId]);

  const selectedParent = parentCandidates.find(
    (candidate) => candidate.id === selectedParentId,
  );

  if (loading) {
    return (
      <AppPage title="Unit">
        <SkeletonBodyText lines={6} />
      </AppPage>
    );
  }

  if (!unit || error) {
    return (
      <AppPage title="Unit not found">
        <Text as="p" tone="critical">
          {error ?? "Unit not found"}
        </Text>
      </AppPage>
    );
  }

  const saleCurrency = unit.saleInfo?.currencyCode ?? "AED";

  function formatSaleAmount(value: string | number | null | undefined) {
    if (value == null || value === "") return "—";
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "—";
    return `${saleCurrency} ${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return (
    <AppPage
      backAction={{
        content: "Product",
        url: `/dashboard/inventory/products/${unit.productId}`,
      }}
      subtitle={`${unit.productName}${unit.productSku ? ` · ${unit.productSku}` : ""}`}
      title={unit.serialNumber}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="start">
              <BlockStack gap="100">
                <Text as="p" tone="subdued" variant="bodySm">
                  Part / product
                </Text>
                <Text as="p" fontWeight="semibold" variant="bodyLg">
                  {unit.productName}
                </Text>
                <Text as="p" tone="subdued">
                  Serial {unit.serialNumber}
                </Text>
              </BlockStack>
              <StatusBadge variant={productUnitStatusVariant(unit.status)}>
                {productUnitStatusLabel(unit.status)}
              </StatusBadge>
            </InlineStack>
            <Text as="p">
              Warehouse: {unit.warehouseName} ({unit.warehouseCode})
            </Text>
            {unitWarranty ? (
              <BlockStack gap="100">
                <Text as="p" tone="subdued" variant="bodySm">
                  Warranty
                </Text>
                <Text as="p">
                  {unitWarranty.policy?.name ?? "Coverage"} ·{" "}
                  {unitWarranty.daysLeft >= 0
                    ? `${unitWarranty.daysLeft} days left`
                    : "Expired"}
                </Text>
                <Link url={`/dashboard/warranty/${unitWarranty.id}`}>
                  View warranty
                </Link>
              </BlockStack>
            ) : unit.status === "sold" ? (
              <Text as="p" tone="subdued">
                No warranty registered for this unit.
              </Text>
            ) : null}
          </BlockStack>
        </Card>

        {/* Sales & Customer Tracking Card */}
        {unit.saleInfo ? (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <ShoppingBag className="text-emerald-600" size={20} />
                  <Text as="h2" variant="headingMd">
                    Sale & Customer Record
                  </Text>
                </InlineStack>
                <Badge tone={unit.saleInfo.paymentState === "paid" ? "success" : "attention"}>
                  {unit.saleInfo.paymentState === "paid" ? "Paid in full" : unit.saleInfo.paymentState}
                </Badge>
              </InlineStack>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 rounded-xl border bg-muted/20 p-4">
                <div>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Customer Account
                  </Text>
                  <Link url={`/dashboard/customers/${unit.saleInfo.customerId}`}>
                    <Text as="p" fontWeight="bold">
                      {unit.saleInfo.customerName}
                    </Text>
                  </Link>
                </div>

                <div>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Invoice
                  </Text>
                  <Link url={`/dashboard/invoices/${unit.saleInfo.invoiceId}`}>
                    <Text as="p" fontWeight="bold">
                      {unit.saleInfo.invoiceNumber}
                    </Text>
                  </Link>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Date: {unit.saleInfo.invoiceDate}
                  </Text>
                </div>

                {unit.saleInfo.quotation ? (
                  <div>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Quotation / Sales Order
                    </Text>
                    <Link url={`/dashboard/sales/quotations/${unit.saleInfo.quotation.id}`}>
                      <Text as="p" fontWeight="bold">
                        {unit.saleInfo.quotation.number}
                      </Text>
                    </Link>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Date: {unit.saleInfo.quotation.quoteDate}
                    </Text>
                  </div>
                ) : null}

                <div>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Unit Sale Price
                  </Text>
                  <Text as="p" fontWeight="bold">
                    {formatSaleAmount(unit.saleInfo.unitPrice)}
                  </Text>
                </div>

                {unit.saleInfo.unitCost ? (
                  <div>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Unit cost
                      {unit.saleInfo.unitCostSource === "invoice"
                        ? " (at invoice)"
                        : unit.saleInfo.unitCostSource === "catalog"
                          ? " (catalog)"
                          : ""}
                    </Text>
                    <Text as="p" fontWeight="bold">
                      {formatSaleAmount(unit.saleInfo.unitCost)}
                    </Text>
                  </div>
                ) : null}

                {unit.saleInfo.grossProfit != null ? (
                  <div>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Gross profit (per unit)
                    </Text>
                    <Text
                      as="p"
                      fontWeight="bold"
                      tone={
                        Number(unit.saleInfo.grossProfit) >= 0
                          ? "success"
                          : "critical"
                      }
                    >
                      {formatSaleAmount(unit.saleInfo.grossProfit)}
                    </Text>
                  </div>
                ) : null}

                {unit.saleInfo.profitMarginPercent != null ? (
                  <div>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Profit margin
                    </Text>
                    <Text as="p" fontWeight="bold" variant="headingMd">
                      {formatMarginPercent(unit.saleInfo.profitMarginPercent)}
                    </Text>
                  </div>
                ) : null}

                <div>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Invoice Total Amount
                  </Text>
                  <Text as="p" fontWeight="bold">
                    {formatSaleAmount(unit.saleInfo.invoiceAmountTotal)}
                  </Text>
                </div>

                <div>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Total Amount Paid
                  </Text>
                  <Text as="p" fontWeight="bold" tone={unit.saleInfo.paymentState === "paid" ? "success" : undefined}>
                    {formatSaleAmount(unit.saleInfo.totalPaid)}
                  </Text>
                </div>
              </div>

              {unit.saleInfo.unitCostSource === "catalog" ? (
                <Text as="p" tone="subdued" variant="bodySm">
                  Cost is from the product catalog — invoice COGS was not recorded
                  yet. Margin is estimated.
                </Text>
              ) : null}

              {!unit.saleInfo.unitCost ? (
                <Text as="p" tone="subdued" variant="bodySm">
                  No unit cost on file — set product cost price or post the invoice
                  to record COGS and margin.
                </Text>
              ) : null}

              {unit.parentUnit && (
                <Text as="p" tone="subdued" variant="bodySm">
                  * Note: This component is linked to main equipment unit <strong>{unit.parentUnit.serialNumber}</strong> ({unit.parentUnit.productName}) which was included in this sale.
                </Text>
              )}
            </BlockStack>
          </Card>
        ) : null}

        {unit.costBreakdown ? (
          <ProductUnitCostBreakdownCard breakdown={unit.costBreakdown} />
        ) : null}

        {unit.costHistory && unit.costHistory.length > 0 ? (
          <ProductUnitCostHistoryCard
            currencyCode={unit.costBreakdown?.currencyCode}
            events={unit.costHistory}
          />
        ) : null}

        {unit.parentUnit ? (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Attached to main unit
              </Text>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 p-4">
                <div className="rounded-lg bg-background px-3 py-2 shadow-sm">
                  <Text as="p" fontWeight="semibold">
                    {unit.productName}
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    S/N {unit.serialNumber}
                  </Text>
                </div>
                <ArrowRight className="text-primary" size={18} />
                <div className="rounded-lg bg-background px-3 py-2 shadow-sm">
                  <Link url={`/dashboard/inventory/units/${unit.parentUnit.id}`}>
                    <Text as="p" fontWeight="semibold">
                      {unit.parentUnit.productName}
                    </Text>
                  </Link>
                  <Text as="p" tone="subdued" variant="bodySm">
                    S/N {unit.parentUnit.serialNumber}
                  </Text>
                </div>
              </div>
              <Button
                tone="critical"
                variant="plain"
                onClick={async () => {
                  await unlinkProductUnit(unit.id);
                  await refreshUnit();
                  setSelectedParentId("");
                }}
              >
                Detach from main unit
              </Button>
            </BlockStack>
          </Card>
        ) : null}

        {unit.childUnits.length > 0 ? (
          <Card padding="0">
            <Box padding="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Attached parts
                </Text>
                {canViewCost ? (
                  <Text as="p" tone="subdued" variant="bodySm">
                    Catalog cost vs sell price — parts sold with the main unit share
                    its invoice line; margin below is per-part catalog reference.
                  </Text>
                ) : null}
              </BlockStack>
            </Box>
            <IndexTable
              headings={[
                { title: "Part" },
                { title: "Serial" },
                { title: "Status" },
                ...(canViewCost
                  ? [
                      { title: "Unit cost", alignment: "end" as const },
                      { title: "Catalog margin", alignment: "end" as const },
                    ]
                  : []),
                { title: "" },
              ]}
              itemCount={unit.childUnits.length}
              selectable={false}
            >
              {unit.childUnits.map((child, index) => (
                <IndexTable.Row id={child.id} key={child.id} position={index}>
                  <IndexTable.Cell>{child.productName}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">
                      {child.serialNumber}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <StatusBadge variant={productUnitStatusVariant(child.status)}>
                      {productUnitStatusLabel(child.status)}
                    </StatusBadge>
                  </IndexTable.Cell>
                  {canViewCost ? (
                    <>
                      <IndexTable.Cell>
                        <Text as="span" alignment="end" numeric>
                          {child.costPrice
                            ? formatMoney(child.costPrice, saleCurrency)
                            : "—"}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" alignment="end" numeric>
                          {formatMarginPercent(child.catalogMarginPercent ?? null)}
                        </Text>
                      </IndexTable.Cell>
                    </>
                  ) : null}
                  <IndexTable.Cell>
                    <Button
                      url={`/dashboard/inventory/units/${child.id}`}
                      variant="plain"
                    >
                      View
                    </Button>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        ) : null}

        {!unit.parentUnit && parentCandidates.length > 0 ? (
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Cpu aria-hidden className="text-sky-600" size={18} />
                  <Text as="h2" variant="headingMd">
                    Attach to main ROV
                  </Text>
                </InlineStack>
                <Text as="p" tone="subdued">
                  This part ({unit.productName} · {unit.serialNumber}) can be
                  linked to a main {parentCandidates[0]?.productName} serial.
                </Text>
              </BlockStack>

              <BlockStack gap="200">
                {parentCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    className={cn(
                      "w-full rounded-xl border-2 bg-card p-4 text-left transition-all",
                      selectedParentId === candidate.id
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:border-primary/40",
                    )}
                    type="button"
                    onClick={() => setSelectedParentId(candidate.id)}
                  >
                    <InlineStack align="space-between" blockAlign="start">
                      <BlockStack gap="050">
                        <Text as="p" fontWeight="semibold">
                          {candidate.productName}
                        </Text>
                        <Text as="p" tone="subdued" variant="bodySm">
                          Serial {candidate.serialNumber}
                        </Text>
                      </BlockStack>
                      <StatusBadge
                        variant={productUnitStatusVariant(candidate.status)}
                      >
                        {productUnitStatusLabel(candidate.status)}
                      </StatusBadge>
                    </InlineStack>
                  </button>
                ))}
              </BlockStack>

              {selectedParent ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="rounded-lg bg-background px-3 py-2 shadow-sm">
                      <span className="block font-semibold">{unit.productName}</span>
                      <span className="text-muted-foreground">
                        S/N {unit.serialNumber}
                      </span>
                    </span>
                    <ArrowRight className="animate-pulse text-primary" size={18} />
                    <span className="rounded-lg bg-background px-3 py-2 shadow-sm">
                      <span className="block font-semibold">
                        {selectedParent.productName}
                      </span>
                      <span className="text-muted-foreground">
                        S/N {selectedParent.serialNumber}
                      </span>
                    </span>
                  </div>
                </div>
              ) : null}

              <Button
                disabled={!selectedParentId}
                loading={linking}
                variant="primary"
                onClick={async () => {
                  if (!selectedParentId) return;
                  setLinking(true);
                  try {
                    await linkProductUnit(unit.id, selectedParentId);
                    await refreshUnit();
                    router.refresh();
                  } finally {
                    setLinking(false);
                  }
                }}
              >
                Attach to selected ROV
              </Button>
            </BlockStack>
          </Card>
        ) : null}
      </BlockStack>
    </AppPage>
  );
}
