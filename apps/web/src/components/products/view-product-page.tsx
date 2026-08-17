"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  IndexTable,
  InlineGrid,
  InlineStack,
  Layout,
  Link,
  Modal,
  Select,
  SkeletonBodyText,
  Text,
  TextField,
} from "@shopify/polaris";
import { Boxes, Package, ScanBarcode } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppPage } from "@/components/layout/page";
import {
  LinkComponentModal,
  type LinkableUnitOption,
} from "@/components/products/link-component-modal";
import { ProductImageGallery } from "@/components/products/product-image-gallery";
import { LineItemDescription } from "@/components/sales/line-item-description";
import {
  productUnitStatusLabel,
  productUnitStatusVariant,
  StatusBadge,
} from "@/components/ui/status-badge";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { currencyById, formatCurrencyAmount } from "@/lib/currency-utils";
import { formatQuantity } from "@/lib/format-quantity";
import { getProductDisplayTags } from "@/lib/product-tags";
import { getProductBadgeTone } from "@/lib/product-badges";
import {
  adjustStock,
  archiveProduct,
  createProductUnit,
  getProduct,
  getProductStock,
  listProductUnits,
} from "@/lib/products-api";
import { listWarehouses } from "@/lib/warehouses-api";
import {
  listWarranties,
  listWarrantyPolicies,
  type WarrantyPolicy,
  type WarrantyRegistration,
} from "@/lib/warranty-api";
import type { ProductDetail, ProductUnit } from "@/types/product";
import type { Warehouse } from "@/types/warehouse";

interface ViewProductPageProps {
  productId: string;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <InlineStack align="space-between" blockAlign="start" gap="400">
      <Text as="span" tone="subdued" variant="bodySm">
        {label}
      </Text>
      <Text as="span" fontWeight="medium" variant="bodySm">
        {value}
      </Text>
    </InlineStack>
  );
}

export function ViewProductPage({ productId }: ViewProductPageProps) {
  const router = useRouter();
  const { currencies, catalogCurrencyId } = useOrgCurrency();
  const [product, setProduct] = useState<ProductDetail | null>(null);

  function formatProductMoney(amount: string | null | undefined) {
    const currency = currencyById(
      currencies,
      product?.priceCurrencyId ?? catalogCurrencyId,
    );

    return formatCurrencyAmount(amount ?? 0, currency);
  }

  const [stockLevels, setStockLevels] = useState<
    Array<{ warehouseId: string; warehouseName: string; quantity: string }>
  >([]);
  const [units, setUnits] = useState<ProductUnit[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustWarehouseId, setAdjustWarehouseId] = useState("");
  const [adjustQuantity, setAdjustQuantity] = useState("");

  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [unitSerial, setUnitSerial] = useState("");
  const [unitWarehouseId, setUnitWarehouseId] = useState("");

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkedComponentsByParent, setLinkedComponentsByParent] = useState<
    Map<string, LinkableUnitOption[]>
  >(new Map());
  const [subProductUnits, setSubProductUnits] = useState<
    Map<
      string,
      Array<{
        id: string;
        serialNumber: string;
        parentUnitId: string | null;
        status: ProductUnit["status"];
      }>
    >
  >(new Map());
  const [defaultPolicy, setDefaultPolicy] = useState<WarrantyPolicy | null>(null);
  const [productWarranties, setProductWarranties] = useState<
    WarrantyRegistration[]
  >([]);

  const loadData = useCallback(async () => {
    const [productData, stockData, warehousesData, warrantiesData, policiesData] =
      await Promise.all([
        getProduct(productId),
        getProductStock(productId),
        listWarehouses({ perPage: 100 }),
        listWarranties({ productId, perPage: 50 }),
        listWarrantyPolicies({ perPage: 200 }),
      ]);

    const unitsData = productData.trackSerial
      ? await listProductUnits(productId, { perPage: 50 })
      : { data: [] };

    setProduct(productData);
    setStockLevels(stockData.levels);
    setUnits(unitsData.data);
    setWarehouses(warehousesData.data);
    setProductWarranties(warrantiesData.data);
    setDefaultPolicy(
      productData.defaultWarrantyPolicyId
        ? policiesData.data.find(
            (policy) => policy.id === productData.defaultWarrantyPolicyId,
          ) ?? null
        : null,
    );
    setAdjustWarehouseId(warehousesData.data[0]?.id ?? "");
    setUnitWarehouseId(warehousesData.data[0]?.id ?? "");

    if (productData.subProducts.some((sub) => sub.trackSerial)) {
      const serializedSubs = productData.subProducts.filter(
        (sub) => sub.trackSerial,
      );
      const subUnitGroups = await Promise.all(
        serializedSubs.map(async (sub) => {
          const subUnits = await listProductUnits(sub.id, { perPage: 100 });
          return { subId: sub.id, units: subUnits.data };
        }),
      );

      const unitsBySub = new Map<
        string,
        Array<{
          id: string;
          serialNumber: string;
          parentUnitId: string | null;
          status: ProductUnit["status"];
        }>
      >();
      const byParent = new Map<string, LinkableUnitOption[]>();

      for (const group of subUnitGroups) {
        unitsBySub.set(
          group.subId,
          group.units.map((unit) => ({
            id: unit.id,
            serialNumber: unit.serialNumber,
            parentUnitId: unit.parentUnitId,
            status: unit.status,
          })),
        );

        for (const unit of group.units) {
          if (!unit.parentUnitId) continue;
          const sub = serializedSubs.find((item) => item.id === group.subId);
          const entry: LinkableUnitOption = {
            id: unit.id,
            serialNumber: unit.serialNumber,
            productId: group.subId,
            productName: sub?.name ?? "Part",
            warehouseName: unit.warehouseName,
            status: unit.status,
            parentUnitId: unit.parentUnitId,
            isSubProduct: true,
          };
          const existing = byParent.get(unit.parentUnitId) ?? [];
          existing.push(entry);
          byParent.set(unit.parentUnitId, existing);
        }
      }

      setSubProductUnits(unitsBySub);
      setLinkedComponentsByParent(byParent);
    } else {
      setSubProductUnits(new Map());
      setLinkedComponentsByParent(new Map());
    }
  }, [productId]);

  useEffect(() => {
    loadData()
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Product not found"),
      )
      .finally(() => setLoading(false));
  }, [loadData]);

  const unitStats = useMemo(() => {
    const inStock = units.filter((unit) => unit.status === "in_stock").length;
    const assigned = units.filter((unit) => unit.status === "assigned").length;
    const sold = units.filter((unit) => unit.status === "sold").length;
    const onHand = inStock + assigned;

    return { inStock, assigned, sold, onHand, total: units.length };
  }, [units]);

  const totalBulkStock = useMemo(
    () =>
      stockLevels.reduce((sum, level) => sum + Number(level.quantity || 0), 0),
    [stockLevels],
  );

  async function handleArchive() {
    await archiveProduct(productId);
    router.push("/dashboard/inventory/products");
  }

  async function handleAdjustStock() {
    await adjustStock({
      productId,
      warehouseId: adjustWarehouseId,
      quantity: adjustQuantity,
    });
    setAdjustOpen(false);
    setAdjustQuantity("");
    await loadData();
  }

  async function handleAddUnit() {
    await createProductUnit(productId, {
      serialNumber: unitSerial,
      warehouseId: unitWarehouseId,
    });
    setUnitModalOpen(false);
    setUnitSerial("");
    await loadData();
  }

  if (loading) {
    return (
      <AppPage title="Product">
        <SkeletonBodyText lines={8} />
      </AppPage>
    );
  }

  if (!product || error) {
    return (
      <AppPage title="Product not found">
        <Text as="p" tone="critical">
          {error ?? "Product not found"}
        </Text>
      </AppPage>
    );
  }

  const editUrl = `/dashboard/inventory/products/${product.id}/edit`;
  const updateStockUrl = `/dashboard/inventory/update-stock?productId=${product.id}`;

  const titleMetadata = (
    <InlineStack gap="200" wrap>
      {getProductDisplayTags(product).map((tag) => (
        <Badge
          key={`${product.id}-${tag}`}
          tone={getProductBadgeTone(tag)}
        >
          {tag}
        </Badge>
      ))}
      {!product.isActive ? <Badge tone="critical">Archived</Badge> : null}
    </InlineStack>
  );

  return (
    <AppPage
      backAction={{
        content: "Products",
        url: "/dashboard/inventory/products",
      }}
      primaryAction={{
        content: "Edit product",
        url: editUrl,
      }}
      secondaryActions={[
        ...(product.type === "goods" && product.isStorable
          ? [
              {
                content: "Update stock",
                url: updateStockUrl,
              },
            ]
          : []),
        {
          content: "Archive",
          destructive: true,
          onAction: handleArchive,
        },
      ]}
      subtitle={product.sku ? `SKU ${product.sku}` : undefined}
      title={product.name}
      titleMetadata={titleMetadata}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {product.equipmentRole === "component" && !product.parentId ? (
              <Banner tone="warning">
                This component is not linked to a main ROV yet.{" "}
                <Link url={editUrl}>Edit product</Link> and choose a parent
                when the main equipment exists.
              </Banner>
            ) : null}

            {product.parent ? (
              <Banner tone="info">
                This is a sub-product of{" "}
                <Link url={`/dashboard/inventory/products/${product.parent.id}`}>
                  {product.parent.name}
                </Link>
                .
              </Banner>
            ) : null}

            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Photos
                  </Text>
                  <Button url={editUrl} variant="plain">
                    Manage photos
                  </Button>
                </InlineStack>
                <ProductImageGallery
                  editUrl={editUrl}
                  images={product.images ?? []}
                  productName={product.name}
                />
              </BlockStack>
            </Card>

            {product.type === "goods" &&
            product.isStorable &&
            product.trackSerial ? (
              <Card padding="0">
                <Box padding="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <ScanBarcode aria-hidden size={18} />
                        <Text as="h2" variant="headingMd">
                          Serial units
                        </Text>
                      </InlineStack>
                      <Text as="p" tone="subdued">
                        {unitStats.total === 0
                          ? "Register each physical unit with its own serial number."
                          : `${unitStats.inStock} in stock · ${unitStats.sold} sold${
                              unitStats.assigned > 0
                                ? ` · ${unitStats.assigned} assigned`
                                : ""
                            }`}
                      </Text>
                    </BlockStack>
                    <InlineStack gap="200">
                      <Button onClick={() => setLinkModalOpen(true)}>
                        Link component
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => setUnitModalOpen(true)}
                      >
                        Add serial
                      </Button>
                    </InlineStack>
                  </InlineStack>
                </Box>

                {units.length === 0 ? (
                  <Box padding="400" paddingBlockStart="0">
                    <Banner tone="info">
                      No serial numbers yet. Add each physical unit (e.g.
                      ROV-ABC-001), or receive stock through a purchase order.
                      For kits, link component serials to a parent ROV serial.
                    </Banner>
                  </Box>
                ) : (
                  <IndexTable
                    headings={[
                      { title: "Serial number" },
                      { title: "Warehouse" },
                      { title: "Attached parts" },
                      { title: "Status" },
                      { title: "" },
                    ]}
                    itemCount={units.length}
                    selectable={false}
                  >
                    {units.map((unit, index) => (
                      <IndexTable.Row
                        id={unit.id}
                        key={unit.id}
                        position={index}
                      >
                        <IndexTable.Cell>
                          <Link
                            url={`/dashboard/inventory/units/${unit.id}`}
                          >
                            <Text as="span" fontWeight="semibold">
                              {unit.serialNumber}
                            </Text>
                          </Link>
                          <Text as="p" tone="subdued" variant="bodySm">
                            {product.name}
                          </Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          {unit.warehouseName || " "}
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          {(linkedComponentsByParent.get(unit.id) ?? [])
                            .length > 0 ? (
                            <BlockStack gap="100">
                              {(
                                linkedComponentsByParent.get(unit.id) ?? []
                              ).map((child) => (
                                <Link
                                  key={child.id}
                                  url={`/dashboard/inventory/units/${child.id}`}
                                >
                                  <Text as="span" variant="bodySm">
                                    {child.productName} · {child.serialNumber}
                                  </Text>
                                </Link>
                              ))}
                            </BlockStack>
                          ) : (
                            <Text as="span" tone="subdued" variant="bodySm">
                              {" "}
                            </Text>
                          )}
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <StatusBadge
                            variant={productUnitStatusVariant(unit.status)}
                          >
                            {productUnitStatusLabel(unit.status)}
                          </StatusBadge>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <InlineStack gap="200">
                            <Button
                              url={`/dashboard/inventory/units/${unit.id}`}
                              variant="plain"
                            >
                              View
                            </Button>
                          </InlineStack>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    ))}
                  </IndexTable>
                )}
              </Card>
            ) : null}

            {!product.parentId ? (
              <Card padding="0">
                <Box padding="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Package aria-hidden size={18} />
                        <Text as="h2" variant="headingMd">
                          Sub-products
                        </Text>
                      </InlineStack>
                      <Text as="p" tone="subdued">
                        Parts and accessories for this ROV. Use{" "}
                        <strong>Link component</strong> to attach existing
                        inventory serials   only create a sub-product here if
                        the part is not in Frog yet.
                      </Text>
                    </BlockStack>
                    <Button
                      url={`/dashboard/inventory/products/new?parentId=${product.id}`}
                    >
                      Add sub-product
                    </Button>
                  </InlineStack>
                </Box>

                {product.subProducts.length > 0 ? (
                  <IndexTable
                    headings={[
                      { title: "Name" },
                      { title: "SKU" },
                      { title: "Type" },
                      { title: "Serial numbers" },
                      { title: "" },
                    ]}
                    itemCount={product.subProducts.length}
                    selectable={false}
                  >
                    {product.subProducts.map((sub, index) => {
                      const serials = subProductUnits.get(sub.id) ?? [];

                      return (
                      <IndexTable.Row
                        id={sub.id}
                        key={sub.id}
                        position={index}
                      >
                        <IndexTable.Cell>
                          <Link
                            url={`/dashboard/inventory/products/${sub.id}`}
                          >
                            {sub.name}
                          </Link>
                        </IndexTable.Cell>
                        <IndexTable.Cell>{sub.sku || " "}</IndexTable.Cell>
                        <IndexTable.Cell>
                          {sub.trackSerial ? "Serialized" : "Bulk"}
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          {!sub.trackSerial ? (
                            <Text as="span" tone="subdued" variant="bodySm">
                              {" "}
                            </Text>
                          ) : serials.length === 0 ? (
                            <Text as="span" tone="subdued" variant="bodySm">
                              No serials yet
                            </Text>
                          ) : (
                            <BlockStack gap="100">
                              {serials.map((unit) => (
                                <Link
                                  key={unit.id}
                                  url={`/dashboard/inventory/units/${unit.id}`}
                                >
                                  <Text as="span" variant="bodySm">
                                    {unit.serialNumber}
                                  </Text>
                                </Link>
                              ))}
                            </BlockStack>
                          )}
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Button
                            url={`/dashboard/inventory/products/${sub.id}`}
                            variant="plain"
                          >
                            View
                          </Button>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                      );
                    })}
                  </IndexTable>
                ) : (
                  <Box padding="400" paddingBlockStart="0">
                    <Text as="p" tone="subdued">
                      No sub-products yet. Add parts like batteries or thrusters.
                    </Text>
                  </Box>
                )}
              </Card>
            ) : null}

            {product.type === "goods" &&
            product.isStorable &&
            !product.trackSerial ? (
              <Card padding="0">
                <Box padding="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Boxes aria-hidden size={18} />
                        <Text as="h2" variant="headingMd">
                          Stock by warehouse
                        </Text>
                      </InlineStack>
                      <Text as="p" tone="subdued">
                        On-hand quantity across all locations.
                      </Text>
                    </BlockStack>
                    <InlineStack gap="200">
                      <Button url={updateStockUrl}>Update stock</Button>
                      <Button onClick={() => setAdjustOpen(true)}>
                        Quick adjust
                      </Button>
                    </InlineStack>
                  </InlineStack>
                </Box>

                {stockLevels.length > 0 ? (
                  <IndexTable
                    headings={[
                      { title: "Warehouse" },
                      { title: "Quantity" },
                      { title: "" },
                    ]}
                    itemCount={stockLevels.length}
                    selectable={false}
                  >
                    {stockLevels.map((level, index) => (
                      <IndexTable.Row
                        id={level.warehouseId}
                        key={level.warehouseId}
                        position={index}
                      >
                        <IndexTable.Cell>{level.warehouseName}</IndexTable.Cell>
                        <IndexTable.Cell>
                          <Text as="span" fontWeight="semibold">
                            {formatQuantity(level.quantity)}
                          </Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Button
                            url={`${updateStockUrl}&warehouseId=${level.warehouseId}`}
                            variant="plain"
                          >
                            Adjust
                          </Button>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    ))}
                  </IndexTable>
                ) : (
                  <Box padding="400" paddingBlockStart="0">
                    <Text as="p" tone="subdued">
                      No stock recorded yet. Use Update stock to set quantities.
                    </Text>
                  </Box>
                )}
              </Card>
            ) : null}
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Overview
                </Text>
                <BlockStack gap="300">
                  <DetailRow label="Reference" value={product.sku || " "} />
                  <DetailRow
                    label="Cost price"
                    value={formatProductMoney(product.costPrice)}
                  />
                  {product.usageType === "for_sale" ? (
                    <DetailRow
                      label="Selling price"
                      value={formatProductMoney(product.sellingPrice)}
                    />
                  ) : (
                    <DetailRow label="Purpose" value="Operations (internal use)" />
                  )}
                  {product.weight ? (
                    <DetailRow label="Weight" value={product.weight} />
                  ) : null}
                  {product.volume ? (
                    <DetailRow label="Volume" value={product.volume} />
                  ) : null}
                </BlockStack>
                <Divider />
                {product.description?.trim() ? (
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Description
                    </Text>
                    <LineItemDescription
                      boldTitle={false}
                      details={product.description}
                      title=""
                    />
                  </BlockStack>
                ) : (
                  <Text as="p" tone="subdued">
                    No description added for this product.
                  </Text>
                )}
              </BlockStack>
            </Card>

            {product.type === "goods" && product.isStorable ? (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Inventory
                  </Text>
                  {product.trackSerial ? (
                    <InlineGrid columns={2} gap="300">
                      <Box
                        background="bg-surface-secondary"
                        borderRadius="200"
                        padding="300"
                      >
                        <BlockStack gap="100">
                          <Text as="p" tone="subdued" variant="bodySm">
                            Available to sell
                          </Text>
                          <Text as="p" fontWeight="bold" variant="headingLg">
                            {unitStats.inStock}
                          </Text>
                          {unitStats.assigned > 0 ? (
                            <Text as="p" tone="subdued" variant="bodySm">
                              {unitStats.inStock > 0
                                ? `${unitStats.inStock} spare · ${unitStats.assigned} on ROV`
                                : `${unitStats.assigned} on ROV (none spare)`}
                            </Text>
                          ) : null}
                        </BlockStack>
                      </Box>
                      <Box
                        background="bg-surface-secondary"
                        borderRadius="200"
                        padding="300"
                      >
                        <BlockStack gap="100">
                          <Text as="p" tone="subdued" variant="bodySm">
                            Sold
                          </Text>
                          <Text as="p" fontWeight="bold" variant="headingLg">
                            {unitStats.sold}
                          </Text>
                        </BlockStack>
                      </Box>
                    </InlineGrid>
                  ) : (
                    <Box
                      background="bg-surface-secondary"
                      borderRadius="200"
                      padding="300"
                    >
                      <BlockStack gap="100">
                        <Text as="p" tone="subdued" variant="bodySm">
                          Total on hand
                        </Text>
                        <Text as="p" fontWeight="bold" variant="headingLg">
                          {totalBulkStock}
                        </Text>
                      </BlockStack>
                    </Box>
                  )}
                  <Button url={updateStockUrl} variant="primary">
                    Update stock
                  </Button>
                </BlockStack>
              </Card>
            ) : null}

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Warranty
                </Text>
                <DetailRow
                  label="Default policy"
                  value={
                    defaultPolicy
                      ? `${defaultPolicy.name} (${defaultPolicy.durationMonths} mo)`
                      : "None"
                  }
                />
                {productWarranties.length > 0 ? (
                  <BlockStack gap="200">
                    <Text as="p" tone="subdued" variant="bodySm">
                      Active registrations
                    </Text>
                    {productWarranties.slice(0, 5).map((warranty) => (
                      <InlineStack
                        align="space-between"
                        blockAlign="center"
                        key={warranty.id}
                      >
                        <BlockStack gap="050">
                          <Text as="span" fontWeight="medium">
                            {warranty.displayCustomerName}
                          </Text>
                          <Text as="span" tone="subdued" variant="bodySm">
                            {warranty.serialNumber
                              ? `SN ${warranty.serialNumber} · `
                              : ""}
                            {warranty.daysLeft >= 0
                              ? `${warranty.daysLeft} days left`
                              : "Expired"}
                          </Text>
                        </BlockStack>
                        <Link url={`/dashboard/warranty/${warranty.id}`}>
                          View
                        </Link>
                      </InlineStack>
                    ))}
                    <Link url={`/dashboard/warranty?productId=${productId}`}>
                      View all warranties
                    </Link>
                  </BlockStack>
                ) : (
                  <Text as="p" tone="subdued">
                    No warranty registrations yet for this product.
                  </Text>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      <Modal
        open={adjustOpen}
        primaryAction={{
          content: "Save",
          onAction: handleAdjustStock,
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setAdjustOpen(false) },
        ]}
        title="Adjust stock"
        onClose={() => setAdjustOpen(false)}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Select
              label="Warehouse"
              options={warehouses.map((warehouse) => ({
                label: warehouse.name,
                value: warehouse.id,
              }))}
              value={adjustWarehouseId}
              onChange={setAdjustWarehouseId}
            />
            <TextField
              autoComplete="off"
              label="Quantity"
              type="number"
              value={adjustQuantity}
              onChange={setAdjustQuantity}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={unitModalOpen}
        primaryAction={{
          content: "Add",
          onAction: handleAddUnit,
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setUnitModalOpen(false) },
        ]}
        title="Add serial number"
        onClose={() => setUnitModalOpen(false)}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <TextField
              autoComplete="off"
              label="Serial number"
              value={unitSerial}
              onChange={setUnitSerial}
            />
            <Select
              label="Warehouse"
              options={warehouses.map((warehouse) => ({
                label: warehouse.name,
                value: warehouse.id,
              }))}
              value={unitWarehouseId}
              onChange={setUnitWarehouseId}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <LinkComponentModal
        open={linkModalOpen}
        parentUnits={units}
        product={product}
        onClose={() => setLinkModalOpen(false)}
        onLinked={loadData}
      />
    </AppPage>
  );
}
