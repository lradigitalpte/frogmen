"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Banner,
  Button,
  ButtonGroup,
  Icon,
  Modal,
  RadioButton,
  SkeletonBodyText,
  Spinner,
  Text,
  TextField,
} from "@shopify/polaris";
import { ArrowRightIcon, CheckIcon, SearchIcon } from "@shopify/polaris-icons";
import { Package, ScanBarcode } from "lucide-react";
import NextLink from "next/link";
import { AppPage } from "@/components/layout/page";
import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import { useToast } from "@/components/providers/toast-provider";
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
import { cn } from "@/lib/utils";
import { listWarehouses } from "@/lib/warehouses-api";
import type { Product, ProductUnit } from "@/types/product";
import type { Warehouse } from "@/types/warehouse";

type AdjustMode = "add" | "remove" | "set";

const QUICK_AMOUNTS = [1, 5, 10, 25, 50];
const LOW_STOCK_MAX = 2;

function UpdateStockPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showSuccess } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [productId, setProductId] = useState(searchParams.get("productId") ?? "");
  const [warehouseId, setWarehouseId] = useState(searchParams.get("warehouseId") ?? "");

  const [product, setProduct] = useState<Product | null>(null);
  const [levels, setLevels] = useState<Map<string, number>>(new Map());
  const [units, setUnits] = useState<ProductUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<AdjustMode>("add");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const [serialInput, setSerialInput] = useState("");
  const [serialSaving, setSerialSaving] = useState(false);
  const [serialFilter, setSerialFilter] = useState("");
  const [pendingRemove, setPendingRemove] = useState<ProductUnit | null>(null);
  const [removeReason, setRemoveReason] = useState<"scrapped" | "sold">("scrapped");
  const [removing, setRemoving] = useState(false);
  const loadRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    void listWarehouses({ perPage: 100 })
      .then((result) => setWarehouses(result.data))
      .catch(() => setWarehouses([]));
  }, []);

  // Product list: storable goods, shown straight away and filtered by search.
  useEffect(() => {
    setProductsLoading(true);
    void listProducts({
      search: debouncedSearch || undefined,
      perPage: 25,
      archived: false,
      type: "goods",
      storableOnly: true,
      includeStock: true,
      sortBy: "name",
      sortDir: "asc",
    })
      .then((result) => setProducts(result.data.filter((item) => item.isStorable && item.type === "goods")))
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));
  }, [debouncedSearch]);

  // Default to the first warehouse — a product link with no warehouse used to load nothing.
  useEffect(() => {
    if (!warehouseId && warehouses.length) setWarehouseId(warehouses[0].id);
  }, [warehouseId, warehouses]);

  // Keep the URL in sync so the page can be shared or refreshed.
  useEffect(() => {
    const params = new URLSearchParams();
    if (productId) params.set("productId", productId);
    if (warehouseId) params.set("warehouseId", warehouseId);
    const next = params.toString();
    if (next !== searchParams.toString()) router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [pathname, productId, router, searchParams, warehouseId]);

  const loadWorkspace = useCallback(async () => {
    if (!productId) {
      setProduct(null);
      return;
    }
    const request = ++loadRef.current;
    setLoading(true);
    setError(null);
    try {
      const detail = await getProduct(productId);
      const next = new Map<string, number>();
      let unitRows: ProductUnit[] = [];
      if (detail.trackSerial) {
        const result = await listProductUnits(productId, { status: "in_stock", perPage: 500 });
        unitRows = result.data;
        for (const unit of unitRows) next.set(unit.warehouseId, (next.get(unit.warehouseId) ?? 0) + 1);
      } else {
        const stock = await getProductStock(productId);
        for (const level of stock.levels) next.set(level.warehouseId, Number(level.quantity) || 0);
      }
      if (request !== loadRef.current) return;
      setProduct(detail);
      setLevels(next);
      setUnits(unitRows);
    } catch (err) {
      if (request !== loadRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load stock");
      setProduct(null);
    } finally {
      if (request === loadRef.current) setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const warehouse = warehouses.find((w) => w.id === warehouseId) ?? null;
  const current = levels.get(warehouseId) ?? 0;
  const totalOnHand = [...levels.values()].reduce((sum, qty) => sum + qty, 0);
  const warehouseUnits = units.filter((u) => u.warehouseId === warehouseId);
  const visibleUnits = warehouseUnits.filter(
    (u) => !serialFilter.trim() || u.serialNumber.toLowerCase().includes(serialFilter.trim().toLowerCase()),
  );

  const parsedAmount = Number(amount);
  const amountValid = amount.trim() !== "" && Number.isFinite(parsedAmount) && parsedAmount >= 0;
  const projected = !amountValid
    ? current
    : mode === "set"
      ? parsedAmount
      : mode === "add"
        ? current + parsedAmount
        : current - parsedAmount;
  const goesNegative = amountValid && projected < 0;
  const noChange = amountValid && projected === current;

  const pendingSerials = useMemo(
    () =>
      [...new Set(serialInput.split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean))],
    [serialInput],
  );
  const existingSerials = new Set(units.map((u) => u.serialNumber.toLowerCase()));
  const duplicateSerials = pendingSerials.filter((s) => existingSerials.has(s.toLowerCase()));

  function chooseProduct(id: string) {
    setProductId(id);
    setAmount("");
    setMode("add");
    setSerialInput("");
    setSerialFilter("");
    setError(null);
  }

  async function handleAdjust() {
    if (!product || !warehouseId || !amountValid || goesNegative || noChange) return;
    setSaving(true);
    setError(null);
    try {
      await adjustStock({ productId: product.id, warehouseId, quantity: String(projected) });
      showSuccess(`${product.name}: ${formatQuantity(String(current))} → ${formatQuantity(String(projected))} in ${warehouse?.name ?? "warehouse"}`);
      setAmount("");
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update stock");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSerials() {
    if (!product || !warehouseId || pendingSerials.length === 0) return;
    setSerialSaving(true);
    setError(null);
    const added: string[] = [];
    const failed: string[] = [];
    for (const serial of pendingSerials) {
      try {
        await createProductUnit(product.id, { serialNumber: serial, warehouseId });
        added.push(serial);
      } catch (err) {
        failed.push(`${serial} (${err instanceof Error ? err.message : "failed"})`);
      }
    }
    setSerialSaving(false);
    setSerialInput(failed.length ? pendingSerials.filter((s) => !added.includes(s)).join("\n") : "");
    if (added.length) showSuccess(added.length === 1 ? `Serial ${added[0]} added` : `${added.length} serials added`);
    if (failed.length) setError(`Couldn't add: ${failed.join(", ")}`);
    await loadWorkspace();
  }

  async function handleConfirmRemove() {
    if (!pendingRemove) return;
    setRemoving(true);
    setError(null);
    try {
      await removeProductUnit(pendingRemove.id, removeReason);
      showSuccess(
        removeReason === "sold"
          ? `${pendingRemove.serialNumber} marked as sold`
          : `${pendingRemove.serialNumber} marked as scrapped`,
      );
      setPendingRemove(null);
      setRemoveReason("scrapped");
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove serial");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <AppPage
      backAction={{ content: "Inventory", url: "/dashboard/inventory" }}
      secondaryActions={[{ content: "Purchase orders", url: "/dashboard/purchasing/orders" }]}
      subtitle="Count, add or remove stock — or register serial numbers for equipment."
      title="Update stock"
    >
      <div className="us">
        {/* Product picker */}
        <aside className="us-picker">
          <div className="us-picker__head">
            <h2>Product</h2>
            <TextField
              autoComplete="off"
              clearButton
              label="Search products"
              labelHidden
              placeholder="Search name or SKU"
              prefix={<Icon source={SearchIcon} />}
              suffix={productsLoading ? <Spinner size="small" /> : undefined}
              value={search}
              onChange={setSearch}
              onClearButtonClick={() => setSearch("")}
            />
          </div>
          <div className="us-picker__list" role="listbox" aria-label="Products">
            {products.length === 0 && !productsLoading ? (
              <p className="us-picker__empty">
                {debouncedSearch ? `No stocked products match “${debouncedSearch}”.` : "No stocked products yet."}
              </p>
            ) : (
              products.map((item) => {
                const qty = item.availableQuantity ?? null;
                return (
                  <button
                    aria-selected={item.id === productId}
                    className={cn("us-pick", item.id === productId && "is-selected")}
                    key={item.id}
                    role="option"
                    type="button"
                    onClick={() => chooseProduct(item.id)}
                  >
                    <ProductListThumbnail alt={item.name} imagePath={item.images?.[0] ?? null} />
                    <span className="us-pick__text">
                      <strong>{item.name}</strong>
                      <small>
                        {item.sku || "No SKU"} · {item.trackSerial ? "Serialized" : "Quantity"}
                      </small>
                    </span>
                    {qty !== null ? (
                      <span className={cn("us-pick__qty", qty <= 0 && "is-out", qty > 0 && qty <= LOW_STOCK_MAX && "is-low")}>
                        {formatQuantity(String(qty))}
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Workspace */}
        <section className="us-work">
          {error ? (
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          ) : null}

          {!productId ? (
            <div className="ex-surface">
              <div className="ex-empty">
                <span className="ex-empty__icon">
                  <Package aria-hidden size={20} />
                </span>
                <strong>Pick a product to start</strong>
                <p>
                  <b>Quantity</b> products (cables, bolts, spares) are counted. <b>Serialized</b> products (ROVs,
                  batteries) are added one serial at a time.
                </p>
              </div>
            </div>
          ) : !product ? (
            <div className="ex-surface ex-pad">
              <SkeletonBodyText lines={6} />
            </div>
          ) : (
            <>
              {/* Header */}
              <section className={cn("pl-hero us-hero", loading && "is-loading")}>
                <div className="pl-hero__main">
                  <span className="pl-hero__label">
                    {product.trackSerial ? "Serials in stock" : "On hand"} · {warehouse?.name ?? "—"}
                  </span>
                  <strong className="pl-hero__value">{formatQuantity(String(current))}</strong>
                  <span className="pl-hero__period">
                    <NextLink className="us-hero__name" href={`/dashboard/inventory/products/${product.id}`}>
                      {product.name}
                    </NextLink>
                    {product.sku ? ` · ${product.sku}` : ""} · {formatQuantity(String(totalOnHand))} across all warehouses
                  </span>
                </div>
                <div className="us-warehouses">
                  <span className="us-warehouses__label">Warehouse</span>
                  <div className="us-warehouses__list">
                    {warehouses.map((w) => {
                      const qty = levels.get(w.id) ?? 0;
                      return (
                        <button
                          className={cn("us-wh", w.id === warehouseId && "is-active")}
                          key={w.id}
                          type="button"
                          onClick={() => {
                            setWarehouseId(w.id);
                            setAmount("");
                          }}
                        >
                          <span>
                            <strong>{w.name}</strong>
                            <small>{w.code}</small>
                          </span>
                          <b>{formatQuantity(String(qty))}</b>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              {product.trackSerial ? (
                <section className="ex-surface">
                  <header className="pd-head">
                    <div>
                      <h2>
                        <ScanBarcode aria-hidden size={17} /> Add serial numbers
                      </h2>
                      <p>One per line, or paste a list separated by commas. Each becomes a unit in {warehouse?.name}.</p>
                    </div>
                  </header>
                  <div className="us-serial-add">
                    <TextField
                      autoComplete="off"
                      label="Serial numbers"
                      labelHidden
                      multiline={3}
                      placeholder="e.g. SN-0001, SN-0002 — or one per line"
                      value={serialInput}
                      onChange={setSerialInput}
                      error={
                        duplicateSerials.length
                          ? `Already registered: ${duplicateSerials.join(", ")}`
                          : undefined
                      }
                    />
                    <div className="us-serial-add__foot">
                      <span>
                        {pendingSerials.length
                          ? `${pendingSerials.length} serial${pendingSerials.length === 1 ? "" : "s"} ready`
                          : "Nothing to add yet"}
                      </span>
                      <Button
                        disabled={!pendingSerials.length || duplicateSerials.length > 0 || !warehouseId}
                        loading={serialSaving}
                        variant="primary"
                        onClick={() => void handleAddSerials()}
                      >
                        {pendingSerials.length > 1 ? `Add ${pendingSerials.length} serials` : "Add serial"}
                      </Button>
                    </div>
                  </div>

                  <div className="pd-toolbar">
                    <strong className="us-subhead">
                      In stock at {warehouse?.name} · {warehouseUnits.length}
                    </strong>
                    {warehouseUnits.length > 5 ? (
                      <div className="pd-toolbar__search">
                        <TextField
                          autoComplete="off"
                          clearButton
                          label="Filter serials"
                          labelHidden
                          placeholder="Filter serials"
                          prefix={<Icon source={SearchIcon} />}
                          value={serialFilter}
                          onChange={setSerialFilter}
                          onClearButtonClick={() => setSerialFilter("")}
                        />
                      </div>
                    ) : null}
                  </div>
                  {warehouseUnits.length === 0 ? (
                    <p className="pd-none">No serials in this warehouse yet. Add some above, or receive them on a purchase order.</p>
                  ) : (
                    <ul className="ex-list us-serials">
                      {visibleUnits.map((unit) => (
                        <li key={unit.id}>
                          <NextLink href={`/dashboard/inventory/units/${unit.id}`}>
                            <strong>{unit.serialNumber}</strong>
                          </NextLink>
                          <Badge tone="success">In stock</Badge>
                          <Button
                            size="slim"
                            tone="critical"
                            variant="tertiary"
                            onClick={() => {
                              setPendingRemove(unit);
                              setRemoveReason("scrapped");
                            }}
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : (
                <section className="ex-surface">
                  <header className="pd-head">
                    <div>
                      <h2>
                        <Package aria-hidden size={17} /> Change quantity
                      </h2>
                      <p>Add stock you received, remove what was used or lost, or set the exact count after a stocktake.</p>
                    </div>
                  </header>
                  <div className="us-qty">
                    <ButtonGroup variant="segmented" fullWidth>
                      <Button pressed={mode === "add"} onClick={() => setMode("add")}>
                        Add
                      </Button>
                      <Button pressed={mode === "remove"} onClick={() => setMode("remove")}>
                        Remove
                      </Button>
                      <Button pressed={mode === "set"} onClick={() => setMode("set")}>
                        Set exact count
                      </Button>
                    </ButtonGroup>

                    <div className="us-qty__row">
                      <div className="us-qty__field">
                        <TextField
                          autoComplete="off"
                          error={
                            amount && !amountValid
                              ? "Enter 0 or more."
                              : goesNegative
                                ? `Only ${formatQuantity(String(current))} on hand — can't remove more than that.`
                                : undefined
                          }
                          label={mode === "add" ? "Units to add" : mode === "remove" ? "Units to remove" : "Units on hand"}
                          min={0}
                          type="number"
                          value={amount}
                          onChange={setAmount}
                        />
                      </div>
                      {mode !== "set" ? (
                        <div className="us-qty__quick">
                          {QUICK_AMOUNTS.map((n) => (
                            <Button key={n} size="slim" onClick={() => setAmount(String((Number(amount) || 0) + n))}>
                              {`${mode === "add" ? "+" : "−"}${n}`}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className={cn("us-preview", goesNegative && "is-error")}>
                      <span>
                        <small>Now</small>
                        <strong>{formatQuantity(String(current))}</strong>
                      </span>
                      <Icon source={ArrowRightIcon} />
                      <span>
                        <small>After</small>
                        <strong>{formatQuantity(String(projected))}</strong>
                      </span>
                      {amountValid && !goesNegative && !noChange ? (
                        <em className={projected > current ? "is-up" : "is-down"}>
                          {projected > current ? "+" : "−"}
                          {formatQuantity(String(Math.abs(projected - current)))}
                        </em>
                      ) : null}
                    </div>

                    <div className="us-qty__actions">
                      <Button
                        disabled={!amountValid || goesNegative || noChange || !warehouseId}
                        icon={CheckIcon}
                        loading={saving}
                        variant="primary"
                        onClick={() => void handleAdjust()}
                      >
                        {mode === "add" ? "Add stock" : mode === "remove" ? "Remove stock" : "Save count"}
                      </Button>
                    </div>
                  </div>
                </section>
              )}

              <p className="pl-foot">
                Receiving from a supplier? Use{" "}
                <NextLink href="/dashboard/purchasing/orders">purchase orders</NextLink> —{" "}
                {product.trackSerial ? "serials are entered when you receive." : "quantities update when you receive."}{" "}
                Sales on invoices take stock out automatically.
              </p>
            </>
          )}
        </section>
      </div>

      <Modal
        open={Boolean(pendingRemove)}
        title={`Remove ${pendingRemove?.serialNumber ?? "serial"} from stock?`}
        onClose={() => {
          if (removing) return;
          setPendingRemove(null);
        }}
        primaryAction={{
          content: removeReason === "sold" ? "Mark as sold" : "Mark as scrapped",
          destructive: true,
          loading: removing,
          onAction: () => void handleConfirmRemove(),
        }}
        secondaryActions={[{ content: "Cancel", disabled: removing, onAction: () => setPendingRemove(null) }]}
      >
        <Modal.Section>
          <div className="us-reasons">
            <Text as="p">Why is it leaving stock?</Text>
            <RadioButton
              checked={removeReason === "scrapped"}
              helpText="Damaged, lost or written off. The serial can be reused later."
              id="remove-reason-scrapped"
              label="Scrapped"
              name="remove-reason"
              onChange={() => setRemoveReason("scrapped")}
            />
            <RadioButton
              checked={removeReason === "sold"}
              helpText="Sold without an invoice here. The serial stays reserved. Invoice it instead if you need warranty and cost tracking."
              id="remove-reason-sold"
              label="Sold"
              name="remove-reason"
              onChange={() => setRemoveReason("sold")}
            />
          </div>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}

export function UpdateStockPage() {
  return (
    <Suspense
      fallback={
        <AppPage title="Update stock">
          <SkeletonBodyText lines={6} />
        </AppPage>
      }
    >
      <UpdateStockPageContent />
    </Suspense>
  );
}
