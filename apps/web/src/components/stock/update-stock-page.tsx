"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  FormLayout,
  IndexTable,
  InlineStack,
  Layout,
  Link,
  RadioButton,
  ResourceItem,
  ResourceList,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { Boxes, Package, ScanBarcode } from "lucide-react";
import { AppPage } from "@/components/layout/page";
import {
  productUnitStatusLabel,
  StatusBadge,
} from "@/components/ui/status-badge";
import { formatQuantity } from "@/lib/format-quantity";
import {
  adjustStock,
  createProductUnit,
  getProduct,
  getProductStock,
  listProductUnits,
  listProducts,
  removeProductUnit,
} from "@/lib/products-api";
import { listWarehouses } from "@/lib/warehouses-api";
import type { Product, ProductUnit } from "@/types/product";
import type { Warehouse } from "@/types/warehouse";

type AdjustMode = "absolute" | "delta";

function UpdateStockPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get("productId") ?? "";
  const initialWarehouseId = searchParams.get("warehouseId") ?? "";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedProductId, setSelectedProductId] = useState(initialProductId);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(
    initialWarehouseId,
  );
  const [product, setProduct] = useState<Product | null>(null);
  const [currentQuantity, setCurrentQuantity] = useState("0");
  const [units, setUnits] = useState<ProductUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [adjustMode, setAdjustMode] = useState<AdjustMode>("delta");
  const [adjustValue, setAdjustValue] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);

  const [newSerial, setNewSerial] = useState("");
  const [serialSaving, setSerialSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    void listWarehouses({ perPage: 100 })
      .then((result) => setWarehouses(result.data))
      .catch(() => setWarehouses([]));
  }, []);

  useEffect(() => {
    if (!debouncedSearch.trim() && !selectedProductId) {
      setProducts([]);
      return;
    }

    setProductsLoading(true);
    void listProducts({
      search: debouncedSearch || undefined,
      perPage: 20,
      archived: false,
    })
      .then((result) => {
        setProducts(
          result.data.filter(
            (item) => item.isStorable && item.type === "goods",
          ),
        );
      })
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));
  }, [debouncedSearch, selectedProductId]);

  const loadWorkspace = useCallback(async () => {
    if (!selectedProductId || !selectedWarehouseId) return;

    setLoading(true);
    setError(null);

    try {
      const [productDetail, stock] = await Promise.all([
        getProduct(selectedProductId),
        getProductStock(selectedProductId),
      ]);

      setProduct(productDetail);

      const level = stock.levels.find(
        (item) => item.warehouseId === selectedWarehouseId,
      );
      setCurrentQuantity(level?.quantity ?? "0");

      if (productDetail.trackSerial) {
        const unitResult = await listProductUnits(selectedProductId, {
          warehouseId: selectedWarehouseId,
          status: "in_stock",
          perPage: 100,
        });
        setUnits(unitResult.data);
      } else {
        setUnits([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stock");
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [selectedProductId, selectedWarehouseId]);

  useEffect(() => {
    if (selectedProductId && selectedWarehouseId) {
      void loadWorkspace();
    }
  }, [loadWorkspace, selectedProductId, selectedWarehouseId]);

  useEffect(() => {
    if (initialProductId && !search) {
      void getProduct(initialProductId)
        .then((detail) => {
          setProduct(detail);
          setSearch(detail.name);
        })
        .catch(() => undefined);
    }
  }, [initialProductId, search]);

  const selectedWarehouse = useMemo(
    () => warehouses.find((item) => item.id === selectedWarehouseId),
    [selectedWarehouseId, warehouses],
  );

  const projectedQuantity = useMemo(() => {
    const current = Number(currentQuantity) || 0;
    const value = Number(adjustValue) || 0;
    return adjustMode === "absolute" ? value : current + value;
  }, [adjustMode, adjustValue, currentQuantity]);

  async function handleBulkAdjust() {
    if (!product || !selectedWarehouseId) return;

    const parsed = Number(adjustValue);
    if (!adjustValue || Number.isNaN(parsed)) {
      setError("Enter a valid quantity.");
      return;
    }

    setAdjustSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (adjustMode === "absolute") {
        await adjustStock({
          productId: product.id,
          warehouseId: selectedWarehouseId,
          quantity: String(parsed),
        });
      } else {
        await adjustStock({
          productId: product.id,
          warehouseId: selectedWarehouseId,
          adjustment: String(parsed),
        });
      }

      setAdjustValue("");
      setSuccess("Stock quantity updated.");
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update stock");
    } finally {
      setAdjustSaving(false);
    }
  }

  async function handleAddSerial() {
    if (!product || !selectedWarehouseId) return;

    if (!newSerial.trim()) {
      setError("Enter a serial number.");
      return;
    }

    setSerialSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await createProductUnit(product.id, {
        serialNumber: newSerial.trim(),
        warehouseId: selectedWarehouseId,
      });
      setNewSerial("");
      setSuccess(`Serial ${newSerial.trim()} added to stock.`);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add serial");
    } finally {
      setSerialSaving(false);
    }
  }

  async function handleScrapUnit(unit: ProductUnit) {
    if (!product) return;

    setError(null);
    setSuccess(null);

    try {
      await removeProductUnit(unit.id);
      setSuccess(`Serial ${unit.serialNumber} removed from stock.`);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove serial");
    }
  }

  function selectProduct(id: string) {
    setSelectedProductId(id);
    setSuccess(null);
    setError(null);
    if (!selectedWarehouseId && warehouses[0]) {
      setSelectedWarehouseId(warehouses[0].id);
    }
  }

  return (
    <AppPage
      backAction={{ content: "Inventory", url: "/dashboard/inventory" }}
      subtitle="Increase quantities for general products, or manage serial numbers for equipment like ROVs."
      title="Update stock"
    >
      <BlockStack gap="500">
        <Banner tone="info">
          <BlockStack gap="200">
            <Text as="p" fontWeight="semibold">
              Two ways to track stock
            </Text>
            <Text as="p">
              <strong>Quantity</strong>   for general parts and consumables sold
              by count (cables, bolts, spares). Just enter how many you have or
              add/remove units (+50 / −5).
            </Text>
            <Text as="p">
              <strong>Serialized</strong>   for equipment where each physical
              unit has its own serial (ROVs, batteries). Each serial is added
              individually or received on a purchase order.
            </Text>
          </BlockStack>
        </Banner>
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}
        {success ? (
          <Banner tone="success" onDismiss={() => setSuccess(null)}>
            {success}
          </Banner>
        ) : null}

        <Layout>
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    1. Choose product
                  </Text>
                  <TextField
                    autoComplete="off"
                    label="Search products"
                    placeholder="Name or SKU…"
                    value={search}
                    onChange={setSearch}
                  />
                  {productsLoading ? (
                    <Text as="p" tone="subdued">
                      Searching…
                    </Text>
                  ) : null}
                  {products.length > 0 ? (
                    <ResourceList
                      items={products}
                      renderItem={(item) => {
                        const selected = item.id === selectedProductId;
                        return (
                          <ResourceItem
                            id={item.id}
                            accessibilityLabel={`Select ${item.name}`}
                            onClick={() => selectProduct(item.id)}
                          >
                            <InlineStack
                              align="space-between"
                              blockAlign="center"
                            >
                              <BlockStack gap="050">
                                <Text
                                  as="span"
                                  fontWeight={selected ? "bold" : "semibold"}
                                >
                                  {item.name}
                                </Text>
                                <Text as="span" tone="subdued" variant="bodySm">
                                  {item.sku || "No SKU"}
                                </Text>
                              </BlockStack>
                              <StatusBadge
                                variant={item.trackSerial ? "info" : "success"}
                              >
                                {item.trackSerial ? "Serialized" : "Quantity"}
                              </StatusBadge>
                            </InlineStack>
                          </ResourceItem>
                        );
                      }}
                    />
                  ) : debouncedSearch ? (
                    <Text as="p" tone="subdued">
                      No storable products found.
                    </Text>
                  ) : (
                    <Text as="p" tone="subdued">
                      Search to pick a product, or open this page from Inventory
                      with a product pre-selected.
                    </Text>
                  )}
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    2. Choose warehouse
                  </Text>
                  <Select
                    disabled={!selectedProductId}
                    label="Warehouse"
                    options={warehouses.map((warehouse) => ({
                      label: `${warehouse.code}   ${warehouse.name}`,
                      value: warehouse.id,
                    }))}
                    placeholder="Select warehouse"
                    value={selectedWarehouseId}
                    onChange={setSelectedWarehouseId}
                  />
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section>
            {!selectedProductId || !selectedWarehouseId ? (
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Stock workspace
                  </Text>
                  <Text as="p" tone="subdued">
                    Select a product and warehouse to update quantity or manage
                    serial numbers.
                  </Text>
                </BlockStack>
              </Card>
            ) : loading && !product ? (
              <Card>
                <Text as="p" tone="subdued">
                  Loading stock…
                </Text>
              </Card>
            ) : product ? (
              <BlockStack gap="400">
                <Card>
                  <InlineStack align="space-between" blockAlign="start" wrap>
                    <InlineStack gap="300" blockAlign="center">
                      <Box
                        background="bg-surface-secondary"
                        borderRadius="full"
                        padding="300"
                      >
                        {product.trackSerial ? (
                          <ScanBarcode
                            aria-hidden
                            size={22}
                            strokeWidth={1.75}
                          />
                        ) : (
                          <Package aria-hidden size={22} strokeWidth={1.75} />
                        )}
                      </Box>
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center" wrap>
                          <Text as="h2" variant="headingLg">
                            {product.name}
                          </Text>
                          <StatusBadge
                            variant={product.trackSerial ? "info" : "success"}
                          >
                            {product.trackSerial ? "Serialized" : "Quantity"}
                          </StatusBadge>
                        </InlineStack>
                        <Text as="p" tone="subdued">
                          {product.sku || "No SKU"} ·{" "}
                          {selectedWarehouse?.name ?? "Warehouse"}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                    <BlockStack gap="050">
                      <Text as="span" tone="subdued" variant="bodySm">
                        On hand
                      </Text>
                      <Text as="span" fontWeight="bold" variant="heading2xl">
                        {product.trackSerial
                          ? units.length
                          : formatQuantity(currentQuantity)}
                      </Text>
                    </BlockStack>
                  </InlineStack>
                </Card>

                {product.trackSerial ? (
                  <Card>
                    <BlockStack gap="400">
                      <Banner tone="warning">
                        <p>
                          <strong>{product.name}</strong> tracks individual
                          serial numbers. To update by quantity only,{" "}
                          <Link url={`/dashboard/inventory/products/${product.id}/edit`}>
                            edit the product
                          </Link>
                          , set role to <strong>General product</strong>, and
                          turn off <strong>Track serial numbers</strong>.
                        </p>
                      </Banner>
                      <BlockStack gap="100">
                        <Text as="h2" variant="headingMd">
                          Serialized stock
                        </Text>
                        <Text as="p" tone="subdued">
                          Each unit needs its own serial number. Quantity equals
                          the number of in-stock serials in this warehouse.
                        </Text>
                      </BlockStack>

                      <FormLayout>
                        <FormLayout.Group>
                          <TextField
                            autoComplete="off"
                            label="Add serial number"
                            placeholder="e.g. SN-65786"
                            value={newSerial}
                            onChange={setNewSerial}
                          />
                          <div style={{ paddingTop: "1.5rem" }}>
                            <Button
                              loading={serialSaving}
                              variant="primary"
                              onClick={() => void handleAddSerial()}
                            >
                              Add to stock
                            </Button>
                          </div>
                        </FormLayout.Group>
                      </FormLayout>

                      <Divider />

                      {units.length > 0 ? (
                        <IndexTable
                          headings={[
                            { title: "Serial number" },
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
                                <Link url={`/dashboard/inventory/units/${unit.id}`}>
                                  {unit.serialNumber}
                                </Link>
                              </IndexTable.Cell>
                              <IndexTable.Cell>
                                <StatusBadge variant="success">
                                  {productUnitStatusLabel(unit.status)}
                                </StatusBadge>
                              </IndexTable.Cell>
                              <IndexTable.Cell>
                                <Button
                                  tone="critical"
                                  variant="plain"
                                  onClick={() => void handleScrapUnit(unit)}
                                >
                                  Remove
                                </Button>
                              </IndexTable.Cell>
                            </IndexTable.Row>
                          ))}
                        </IndexTable>
                      ) : (
                        <Text as="p" tone="subdued">
                          No serial numbers in this warehouse yet. Add one above
                          or receive via a purchase order.
                        </Text>
                      )}
                    </BlockStack>
                  </Card>
                ) : (
                  <Card>
                    <BlockStack gap="400">
                      <BlockStack gap="100">
                        <Text as="h2" variant="headingMd">
                          Quantity on hand
                        </Text>
                        <Text as="p" tone="subdued">
                          No serial numbers needed. Enter how many units you
                          have in this warehouse   add stock when you receive
                          more, or remove when you sell or use items.
                        </Text>
                      </BlockStack>

                      <div className="quotation-summary-panel__rows">
                        <div className="quotation-summary-row">
                          <Text as="span" tone="subdued" variant="bodySm">
                            Current on hand
                          </Text>
                          <Text as="span" fontWeight="semibold">
                            {formatQuantity(currentQuantity)}
                          </Text>
                        </div>
                        <div className="quotation-summary-row">
                          <Text as="span" tone="subdued" variant="bodySm">
                            After update
                          </Text>
                          <Text as="span" fontWeight="semibold">
                            {projectedQuantity}
                          </Text>
                        </div>
                      </div>

                      <BlockStack gap="200">
                        <Text as="p" fontWeight="semibold">
                          Quick add
                        </Text>
                        <InlineStack gap="200" wrap>
                          {[1, 5, 10, 25, 50, 100].map((amount) => (
                            <Button
                              key={amount}
                              size="slim"
                              onClick={() => {
                                setAdjustMode("delta");
                                setAdjustValue(String(amount));
                              }}
                            >
                              {`+${amount}`}
                            </Button>
                          ))}
                        </InlineStack>
                      </BlockStack>

                      <BlockStack gap="200">
                        <Text as="p" fontWeight="semibold">
                          Update method
                        </Text>
                        <RadioButton
                          checked={adjustMode === "delta"}
                          id="stock-delta"
                          label="Add or remove (+5 / −2)"
                          name="stock-mode"
                          onChange={() => setAdjustMode("delta")}
                        />
                        <RadioButton
                          checked={adjustMode === "absolute"}
                          id="stock-absolute"
                          label="Set exact quantity on hand"
                          name="stock-mode"
                          onChange={() => setAdjustMode("absolute")}
                        />
                      </BlockStack>

                      <FormLayout>
                        <TextField
                          autoComplete="off"
                          helpText={
                            adjustMode === "delta"
                              ? "Use negative numbers to remove stock (e.g. −3 after a sale)."
                              : "Replaces the current quantity (e.g. set to 120 after a stock count)."
                          }
                          label={
                            adjustMode === "delta"
                              ? "Change by (+/−)"
                              : "New quantity on hand"
                          }
                          type="number"
                          value={adjustValue}
                          onChange={setAdjustValue}
                        />
                      </FormLayout>

                      <Button
                        loading={adjustSaving}
                        variant="primary"
                        onClick={() => void handleBulkAdjust()}
                      >
                        Update quantity
                      </Button>
                    </BlockStack>
                  </Card>
                )}

                <Card>
                  <InlineStack align="space-between">
                    <InlineStack gap="200" blockAlign="center">
                      <Boxes aria-hidden size={18} />
                      <Text as="span" tone="subdued" variant="bodySm">
                        {product.trackSerial ? (
                          <>
                            Receiving from suppliers? Use{" "}
                            <Link url="/dashboard/purchasing/orders">
                              Purchase orders
                            </Link>{" "}
                              serial numbers are entered at receive time.
                          </>
                        ) : (
                          <>
                            Receiving from suppliers? Use{" "}
                            <Link url="/dashboard/purchasing/orders">
                              Purchase orders
                            </Link>{" "}
                              only quantity is needed, no serial numbers.
                          </>
                        )}
                      </Text>
                    </InlineStack>
                    <Button
                      onClick={() =>
                        router.push(
                          `/dashboard/inventory/products/${product.id}`,
                        )
                      }
                    >
                      Product details
                    </Button>
                  </InlineStack>
                </Card>
              </BlockStack>
            ) : null}
          </Layout.Section>
        </Layout>
      </BlockStack>
    </AppPage>
  );
}

export function UpdateStockPage() {
  return (
    <Suspense
      fallback={
        <AppPage title="Update stock">
          <Text as="p" tone="subdued">
            Loading…
          </Text>
        </AppPage>
      }
    >
      <UpdateStockPageContent />
    </Suspense>
  );
}
