"use client";

import {
  BlockStack,
  Box,
  Button,
  Card,
  IndexTable,
  InlineStack,
  Link,
  SkeletonBodyText,
  Text,
} from "@shopify/polaris";
import { ArrowRight, Cpu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import {
  productUnitStatusLabel,
  productUnitStatusVariant,
  StatusBadge,
} from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
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
              <Text as="h2" variant="headingMd">
                Attached parts
              </Text>
            </Box>
            <IndexTable
              headings={[
                { title: "Part" },
                { title: "Serial" },
                { title: "Status" },
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
