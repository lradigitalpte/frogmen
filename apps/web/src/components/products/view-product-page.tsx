"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Icon,
  Link,
  Modal,
  Pagination,
  Select,
  SkeletonBodyText,
  SkeletonDisplayText,
  Text,
  TextField,
} from "@shopify/polaris";
import { ChevronRightIcon, SearchIcon } from "@shopify/polaris-icons";
import { Boxes, Package, ScanBarcode, ShieldCheck } from "lucide-react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { LinkComponentModal, type LinkableUnitOption } from "@/components/products/link-component-modal";
import { ProductImageGallery } from "@/components/products/product-image-gallery";
import { LineItemDescription } from "@/components/sales/line-item-description";
import { productUnitStatusLabel } from "@/components/ui/status-badge";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { currencyById, formatCurrencyAmount } from "@/lib/currency-utils";
import { formatAppDate } from "@/lib/format-date";
import { formatQuantity } from "@/lib/format-quantity";
import { getProductDisplayTags } from "@/lib/product-tags";
import { getProductBadgeTone } from "@/lib/product-badges";
import { useToast } from "@/components/providers/toast-provider";
import { DeleteProductModal } from "@/components/products/delete-product-modal";
import {
  adjustStock,
  archiveProduct,
  createProductUnit,
  getProduct,
  getProductStock,
  listProductUnits,
  permanentlyDeleteProduct,
  restoreProduct,
} from "@/lib/products-api";
import { cn } from "@/lib/utils";
import { listWarehouses } from "@/lib/warehouses-api";
import {
  listWarranties,
  listWarrantyPolicies,
  type WarrantyPolicy,
  type WarrantyRegistration,
} from "@/lib/warranty-api";
import type { ProductDetail, ProductUnit, ProductUnitStatus } from "@/types/product";
import type { Warehouse } from "@/types/warehouse";

interface ViewProductPageProps {
  productId: string;
}

type UnitFilter = "all" | ProductUnitStatus;

const UNIT_FILTERS: Array<{ id: UnitFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "in_stock", label: "In stock" },
  { id: "assigned", label: "Assigned" },
  { id: "sold", label: "Sold" },
  { id: "scrapped", label: "Scrapped" },
];

const UNIT_ORDER: Record<ProductUnitStatus, number> = { in_stock: 0, assigned: 1, sold: 2, scrapped: 3 };
const UNIT_PAGE_SIZES = [10, 25, 50];

function unitTone(status: ProductUnitStatus) {
  switch (status) {
    case "in_stock":
      return "success" as const;
    case "assigned":
      return "info" as const;
    case "scrapped":
      return "critical" as const;
    default:
      return undefined;
  }
}

type SubUnit = { id: string; serialNumber: string; parentUnitId: string | null; status: ProductUnit["status"] };

export function ViewProductPage({ productId }: ViewProductPageProps) {
  const router = useRouter();
  const { showSuccess } = useToast();
  const { currencies, catalogCurrencyId } = useOrgCurrency();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [stockLevels, setStockLevels] = useState<Array<{ warehouseId: string; warehouseName: string; quantity: string }>>([]);
  const [units, setUnits] = useState<ProductUnit[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustWarehouseId, setAdjustWarehouseId] = useState("");
  const [adjustQuantity, setAdjustQuantity] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [unitSerial, setUnitSerial] = useState("");
  const [unitWarehouseId, setUnitWarehouseId] = useState("");
  const [unitSaving, setUnitSaving] = useState(false);
  const [unitError, setUnitError] = useState<string | null>(null);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [linkedComponentsByParent, setLinkedComponentsByParent] = useState<Map<string, LinkableUnitOption[]>>(new Map());
  const [subProductUnits, setSubProductUnits] = useState<Map<string, SubUnit[]>>(new Map());
  const [defaultPolicy, setDefaultPolicy] = useState<WarrantyPolicy | null>(null);
  const [productWarranties, setProductWarranties] = useState<WarrantyRegistration[]>([]);

  const [unitFilter, setUnitFilter] = useState<UnitFilter>("all");
  const [unitQuery, setUnitQuery] = useState("");
  const [unitPage, setUnitPage] = useState(1);
  const [unitPerPage, setUnitPerPage] = useState(UNIT_PAGE_SIZES[0]);

  const loadData = useCallback(async () => {
    const [productData, stockData, warehousesData, warrantiesData, policiesData] = await Promise.all([
      getProduct(productId),
      getProductStock(productId),
      listWarehouses({ perPage: 100 }),
      listWarranties({ productId, perPage: 50 }),
      listWarrantyPolicies({ perPage: 200 }),
    ]);

    const unitsData = productData.trackSerial ? await listProductUnits(productId, { perPage: 500 }) : { data: [] };

    setProduct(productData);
    setStockLevels(stockData.levels);
    setUnits(unitsData.data);
    setWarehouses(warehousesData.data);
    setProductWarranties(warrantiesData.data);
    setDefaultPolicy(
      productData.defaultWarrantyPolicyId
        ? policiesData.data.find((policy) => policy.id === productData.defaultWarrantyPolicyId) ?? null
        : null,
    );
    setAdjustWarehouseId((current) => current || warehousesData.data[0]?.id || "");
    setUnitWarehouseId((current) => current || warehousesData.data[0]?.id || "");

    const serializedSubs = productData.subProducts.filter((sub) => sub.trackSerial);
    if (serializedSubs.length) {
      const subUnitGroups = await Promise.all(
        serializedSubs.map(async (sub) => {
          const subUnits = await listProductUnits(sub.id, { perPage: 500 });
          return { subId: sub.id, units: subUnits.data };
        }),
      );

      const unitsBySub = new Map<string, SubUnit[]>();
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
          byParent.set(unit.parentUnitId, [...(byParent.get(unit.parentUnitId) ?? []), entry]);
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
      .catch((err) => setError(err instanceof Error ? err.message : "Product not found"))
      .finally(() => setLoading(false));
  }, [loadData]);

  const unitStats = useMemo(() => {
    const count = (status: ProductUnitStatus) => units.filter((unit) => unit.status === status).length;
    return {
      in_stock: count("in_stock"),
      assigned: count("assigned"),
      sold: count("sold"),
      scrapped: count("scrapped"),
      all: units.length,
    };
  }, [units]);

  const totalBulkStock = useMemo(
    () => stockLevels.reduce((sum, level) => sum + Number(level.quantity || 0), 0),
    [stockLevels],
  );

  const filteredUnits = useMemo(() => {
    const q = unitQuery.trim().toLowerCase();
    return units
      .filter((unit) => unitFilter === "all" || unit.status === unitFilter)
      .filter(
        (unit) =>
          !q ||
          unit.serialNumber.toLowerCase().includes(q) ||
          (unit.warehouseName ?? "").toLowerCase().includes(q) ||
          (linkedComponentsByParent.get(unit.id) ?? []).some((c) => c.serialNumber.toLowerCase().includes(q)),
      )
      .sort(
        (a, b) =>
          UNIT_ORDER[a.status] - UNIT_ORDER[b.status] || b.createdAt.localeCompare(a.createdAt),
      );
  }, [linkedComponentsByParent, unitFilter, unitQuery, units]);

  const unitPages = Math.max(1, Math.ceil(filteredUnits.length / unitPerPage));
  const safeUnitPage = Math.min(unitPage, unitPages);
  const pageUnits = filteredUnits.slice((safeUnitPage - 1) * unitPerPage, safeUnitPage * unitPerPage);

  const activeWarranties = productWarranties.filter((w) => w.status === "active" && w.daysLeft >= 0);

  function formatProductMoney(amount: string | null | undefined) {
    const currency = currencyById(currencies, product?.priceCurrencyId ?? catalogCurrencyId);
    return formatCurrencyAmount(amount ?? 0, currency);
  }

  async function handleArchive() {
    setArchiving(true);
    setActionError(null);
    try {
      await archiveProduct(productId);
      showSuccess("Product archived");
      router.push("/dashboard/inventory/products");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't archive the product");
      setArchiving(false);
      setArchiveOpen(false);
    }
  }

  async function handleRestore() {
    setActionError(null);
    try {
      await restoreProduct(productId);
      showSuccess("Product restored");
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't restore the product");
    }
  }

  async function handlePermanentDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await permanentlyDeleteProduct(productId);
      showSuccess("Product deleted");
      router.push("/dashboard/inventory/products");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete product");
    } finally {
      setDeleting(false);
    }
  }

  function openAdjust(warehouseId?: string) {
    const id = warehouseId || adjustWarehouseId || warehouses[0]?.id || "";
    setAdjustWarehouseId(id);
    const current = stockLevels.find((level) => level.warehouseId === id)?.quantity;
    setAdjustQuantity(current ? String(Number(current)) : "");
    setAdjustError(null);
    setAdjustOpen(true);
  }

  async function handleAdjustStock() {
    const qty = Number(adjustQuantity);
    if (adjustQuantity.trim() === "" || !Number.isFinite(qty) || qty < 0) {
      setAdjustError("Enter a quantity of 0 or more.");
      return;
    }
    if (!adjustWarehouseId) {
      setAdjustError("Choose a warehouse.");
      return;
    }
    setAdjustSaving(true);
    setAdjustError(null);
    try {
      await adjustStock({ productId, warehouseId: adjustWarehouseId, quantity: String(qty) });
      setAdjustOpen(false);
      setAdjustQuantity("");
      showSuccess("Stock updated");
      await loadData();
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : "Couldn't update stock");
    } finally {
      setAdjustSaving(false);
    }
  }

  async function handleAddUnit() {
    const serial = unitSerial.trim();
    if (!serial) {
      setUnitError("Enter a serial number.");
      return;
    }
    if (!unitWarehouseId) {
      setUnitError("Choose a warehouse.");
      return;
    }
    setUnitSaving(true);
    setUnitError(null);
    try {
      await createProductUnit(productId, { serialNumber: serial, warehouseId: unitWarehouseId });
      setUnitModalOpen(false);
      setUnitSerial("");
      showSuccess(`Serial ${serial} added`);
      await loadData();
    } catch (err) {
      setUnitError(err instanceof Error ? err.message : "Couldn't add the serial");
    } finally {
      setUnitSaving(false);
    }
  }

  if (loading) {
    return (
      <AppPage title="Product">
        <div className="pl">
          <div className="pl-hero">
            <SkeletonDisplayText size="large" />
          </div>
          <SkeletonBodyText lines={8} />
        </div>
      </AppPage>
    );
  }

  if (!product || error) {
    return (
      <AppPage backAction={{ content: "Products", url: "/dashboard/inventory/products" }} title="Product not found">
        <div className="ac-error">{error ?? "Product not found"}</div>
      </AppPage>
    );
  }

  const editUrl = `/dashboard/inventory/products/${product.id}/edit`;
  const updateStockUrl = `/dashboard/inventory/update-stock?productId=${product.id}`;
  const stocked = product.type === "goods" && product.isStorable;
  const serialized = stocked && product.trackSerial;
  const forSale = product.usageType === "for_sale";
  const cost = Number(product.costPrice) || 0;
  const price = Number(product.sellingPrice) || 0;
  const margin = forSale && price > 0 && cost > 0 ? ((price - cost) / price) * 100 : null;
  const available = serialized ? unitStats.in_stock : totalBulkStock;
  const archived = !product.isActive || Boolean(product.deletedAt);

  const titleMetadata = (
    <span className="pd-tags">
      {getProductDisplayTags(product).map((tag) => (
        <Badge key={`${product.id}-${tag}`} tone={getProductBadgeTone(tag)}>
          {tag}
        </Badge>
      ))}
      {archived ? <Badge tone="critical">Archived</Badge> : null}
    </span>
  );

  return (
    <AppPage
      backAction={{ content: "Products", url: "/dashboard/inventory/products" }}
      primaryAction={{ content: "Edit product", url: editUrl }}
      secondaryActions={[
        ...(stocked ? [{ content: serialized ? "Manage serials" : "Update stock", url: updateStockUrl }] : []),
        product.deletedAt
          ? { content: "Restore", onAction: () => void handleRestore() }
          : { content: "Archive", onAction: () => setArchiveOpen(true) },
        ...(product.deletedAt
          ? [
              {
                content: "Delete forever",
                destructive: true,
                onAction: () => {
                  setDeleteError(null);
                  setDeleteOpen(true);
                },
              },
            ]
          : []),
      ]}
      subtitle={product.sku ? `SKU ${product.sku}` : undefined}
      title={product.name}
      titleMetadata={titleMetadata}
    >
      <div className="pl pd">
        {actionError ? (
          <Banner tone="critical" onDismiss={() => setActionError(null)}>
            {actionError}
          </Banner>
        ) : null}
        {archived ? (
          <Banner tone="warning">This product is archived — it won&apos;t show on new quotes, orders or invoices.</Banner>
        ) : null}
        {product.equipmentRole === "component" && !product.parentId ? (
          <Banner tone="warning">
            This component isn&apos;t linked to a main ROV yet. <Link url={editUrl}>Edit the product</Link> and choose a
            parent once the main equipment exists.
          </Banner>
        ) : null}
        {product.parent ? (
          <Banner tone="info">
            Part of <Link url={`/dashboard/inventory/products/${product.parent.id}`}>{product.parent.name}</Link>.
          </Banner>
        ) : null}

        {/* Hero */}
        <section className="pl-hero">
          <div className="pl-hero__main">
            <span className="pl-hero__label">{stocked ? "Available to sell" : "Product"}</span>
            <strong className="pl-hero__value">
              {stocked ? formatQuantity(String(available)) : forSale ? formatProductMoney(product.sellingPrice) : "—"}
            </strong>
            <span className="pl-hero__period">
              {serialized
                ? [
                    `${unitStats.in_stock} in stock`,
                    unitStats.assigned ? `${unitStats.assigned} assigned` : null,
                    `${unitStats.sold} sold`,
                    unitStats.scrapped ? `${unitStats.scrapped} scrapped` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : stocked
                  ? `Across ${stockLevels.length} warehouse${stockLevels.length === 1 ? "" : "s"}`
                  : product.type === "service"
                    ? "Service — no stock tracked"
                    : "Not tracked in stock"}
            </span>
            {stocked && available === 0 ? <span className="pd-alert">Out of stock</span> : null}
          </div>
          <div className="pl-hero__tiles">
            {forSale ? (
              <div className="ac-tile">
                <span>Selling price</span>
                <strong>{formatProductMoney(product.sellingPrice)}</strong>
                <small>{margin === null ? "Per unit" : `${margin.toFixed(0)}% margin`}</small>
              </div>
            ) : (
              <div className="ac-tile">
                <span>Purpose</span>
                <strong>Internal</strong>
                <small>Used in operations</small>
              </div>
            )}
            <div className="ac-tile">
              <span>Cost price</span>
              <strong>{formatProductMoney(product.costPrice)}</strong>
              <small>{margin === null ? "Per unit" : `${formatProductMoney(String(price - cost))} profit / unit`}</small>
            </div>
            <div className="ac-tile">
              <span>Warranties</span>
              <strong>{activeWarranties.length}</strong>
              <small>{defaultPolicy ? `${defaultPolicy.durationMonths}-month default` : "No default policy"}</small>
            </div>
          </div>
        </section>

        <div className="pd-grid">
          <div className="pd-main">
            {/* Serial units */}
            {serialized ? (
              <section className="ex-surface">
                <header className="pd-head">
                  <div>
                    <h2>
                      <ScanBarcode aria-hidden size={17} /> Serial units
                    </h2>
                    <p>Every physical unit, its location and any parts attached to it.</p>
                  </div>
                  <div className="pd-head__actions">
                    <Button disabled={units.length === 0} onClick={() => setLinkModalOpen(true)}>
                      Link component
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => {
                        setUnitError(null);
                        setUnitModalOpen(true);
                      }}
                    >
                      Add serial
                    </Button>
                  </div>
                </header>

                {units.length === 0 ? (
                  <div className="ex-empty">
                    <strong>No serial numbers yet</strong>
                    <p>
                      Add each physical unit (e.g. ROV-ABC-001) or receive it through a purchase order. For kits, link
                      component serials to a parent serial.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="pd-toolbar">
                      <div className="iv-filters">
                        {UNIT_FILTERS.filter((f) => f.id === "all" || unitStats[f.id] > 0).map((f) => (
                          <button
                            className={cn("iv-filter", unitFilter === f.id && "is-active")}
                            key={f.id}
                            type="button"
                            onClick={() => {
                              setUnitFilter(f.id);
                              setUnitPage(1);
                            }}
                          >
                            {f.label} <span>{unitStats[f.id]}</span>
                          </button>
                        ))}
                      </div>
                      {units.length > 5 ? (
                        <div className="pd-toolbar__search">
                          <TextField
                            autoComplete="off"
                            clearButton
                            label="Search serials"
                            labelHidden
                            placeholder="Search serials"
                            prefix={<Icon source={SearchIcon} />}
                            value={unitQuery}
                            onChange={(v) => {
                              setUnitQuery(v);
                              setUnitPage(1);
                            }}
                            onClearButtonClick={() => setUnitQuery("")}
                          />
                        </div>
                      ) : null}
                    </div>

                    {pageUnits.length === 0 ? (
                      <p className="pd-none">No serials match.</p>
                    ) : (
                      <ul className="ex-list">
                        {pageUnits.map((unit) => {
                          const parts = linkedComponentsByParent.get(unit.id) ?? [];
                          return (
                            <li className={cn("pd-unit", unit.status !== "in_stock" && unit.status !== "assigned" && "is-gone")} key={unit.id}>
                              <NextLink className="pd-unit__main" href={`/dashboard/inventory/units/${unit.id}`}>
                                <strong>{unit.serialNumber}</strong>
                                <small>
                                  {unit.warehouseName || "No warehouse"} · added {formatAppDate(unit.createdAt)}
                                </small>
                              </NextLink>
                              <span className="pd-unit__parts">
                                {parts.length ? (
                                  parts.map((child) => (
                                    <NextLink href={`/dashboard/inventory/units/${child.id}`} key={child.id}>
                                      {child.productName} · {child.serialNumber}
                                    </NextLink>
                                  ))
                                ) : (
                                  <small>No parts attached</small>
                                )}
                              </span>
                              <span className="pd-unit__status">
                                <Badge tone={unitTone(unit.status)}>{productUnitStatusLabel(unit.status)}</Badge>
                              </span>
                              <NextLink aria-label={`Open ${unit.serialNumber}`} className="pd-chev" href={`/dashboard/inventory/units/${unit.id}`}>
                                <Icon source={ChevronRightIcon} />
                              </NextLink>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {filteredUnits.length > UNIT_PAGE_SIZES[0] ? (
                      <div className="iv-pager">
                        <span>
                          Showing{" "}
                          <strong>
                            {(safeUnitPage - 1) * unitPerPage + 1}–{Math.min(safeUnitPage * unitPerPage, filteredUnits.length)}
                          </strong>{" "}
                          of <strong>{filteredUnits.length}</strong> serials
                        </span>
                        <div className="iv-pager__controls">
                          <div className="ex-perpage">
                            <Select
                              label="Rows per page"
                              labelInline
                              options={UNIT_PAGE_SIZES.map((n) => ({ label: String(n), value: String(n) }))}
                              value={String(unitPerPage)}
                              onChange={(v) => {
                                setUnitPerPage(Number(v));
                                setUnitPage(1);
                              }}
                            />
                          </div>
                          <Pagination
                            hasNext={safeUnitPage < unitPages}
                            hasPrevious={safeUnitPage > 1}
                            label={`${safeUnitPage} / ${unitPages}`}
                            onNext={() => setUnitPage(safeUnitPage + 1)}
                            onPrevious={() => setUnitPage(safeUnitPage - 1)}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="iv-pager">
                        <span>
                          <strong>{filteredUnits.length}</strong> serial{filteredUnits.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </section>
            ) : null}

            {/* Stock by warehouse (bulk) */}
            {stocked && !serialized ? (
              <section className="ex-surface">
                <header className="pd-head">
                  <div>
                    <h2>
                      <Boxes aria-hidden size={17} /> Stock by warehouse
                    </h2>
                    <p>On-hand quantity in each location.</p>
                  </div>
                  <div className="pd-head__actions">
                    <Button onClick={() => openAdjust()}>Set quantity</Button>
                    <Button url={updateStockUrl} variant="primary">
                      Update stock
                    </Button>
                  </div>
                </header>
                {stockLevels.length === 0 ? (
                  <div className="ex-empty">
                    <strong>No stock recorded yet</strong>
                    <p>Set a quantity for a warehouse to start tracking this product.</p>
                  </div>
                ) : (
                  <ul className="ex-list">
                    {stockLevels.map((level) => {
                      const qty = Number(level.quantity) || 0;
                      const max = Math.max(...stockLevels.map((l) => Number(l.quantity) || 0), 1);
                      return (
                        <li className="pd-level" key={level.warehouseId}>
                          <NextLink className="pd-level__name" href={`/dashboard/inventory/warehouses/${level.warehouseId}`}>
                            {level.warehouseName}
                          </NextLink>
                          <span className="pd-level__bar">
                            <b style={{ width: `${(qty / max) * 100}%` }} />
                          </span>
                          <span className={cn("pd-level__qty", qty <= 0 && "is-out", qty > 0 && qty <= 2 && "is-low")}>
                            {formatQuantity(level.quantity)}
                          </span>
                          <Button size="slim" variant="tertiary" onClick={() => openAdjust(level.warehouseId)}>
                            Adjust
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ) : null}

            {/* Sub-products */}
            {!product.parentId ? (
              <section className="ex-surface">
                <header className="pd-head">
                  <div>
                    <h2>
                      <Package aria-hidden size={17} /> Sub-products
                    </h2>
                    <p>
                      Parts and accessories for this product. To attach a part that&apos;s already in stock, use{" "}
                      <strong>Link component</strong> instead.
                    </p>
                  </div>
                  <div className="pd-head__actions">
                    <Button url={`/dashboard/inventory/products/new?parentId=${product.id}`}>Add sub-product</Button>
                  </div>
                </header>
                {product.subProducts.length === 0 ? (
                  <p className="pd-none">No sub-products yet — add parts like batteries or thrusters.</p>
                ) : (
                  <ul className="ex-list">
                    {product.subProducts.map((sub) => {
                      const serials = subProductUnits.get(sub.id) ?? [];
                      return (
                        <li className="pd-sub" key={sub.id}>
                          <NextLink className="pd-unit__main" href={`/dashboard/inventory/products/${sub.id}`}>
                            <strong>{sub.name}</strong>
                            <small>{sub.sku || "No SKU"}</small>
                          </NextLink>
                          <span className="pd-unit__parts">
                            {!sub.trackSerial ? (
                              <small>Bulk item</small>
                            ) : serials.length === 0 ? (
                              <small>No serials yet</small>
                            ) : (
                              serials.map((unit) => (
                                <NextLink
                                  className={cn(unit.status !== "in_stock" && unit.status !== "assigned" && "is-gone")}
                                  href={`/dashboard/inventory/units/${unit.id}`}
                                  key={unit.id}
                                  title={productUnitStatusLabel(unit.status)}
                                >
                                  {unit.serialNumber}
                                </NextLink>
                              ))
                            )}
                          </span>
                          <span className="pd-unit__status">
                            <Badge tone={sub.trackSerial ? "info" : undefined}>{sub.trackSerial ? "Serialized" : "Bulk"}</Badge>
                          </span>
                          <NextLink aria-label={`Open ${sub.name}`} className="pd-chev" href={`/dashboard/inventory/products/${sub.id}`}>
                            <Icon source={ChevronRightIcon} />
                          </NextLink>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ) : null}
          </div>

          <aside className="pd-side">
            {/* Photos */}
            <section className="pd-card">
              <div className="pd-card__head">
                <h3>Photos</h3>
                <Button url={editUrl} variant="plain">
                  Manage
                </Button>
              </div>
              <ProductImageGallery editUrl={editUrl} images={product.images ?? []} productName={product.name} />
            </section>

            {/* Details */}
            <section className="pd-card">
              <div className="pd-card__head">
                <h3>Details</h3>
                <Button url={editUrl} variant="plain">
                  Edit
                </Button>
              </div>
              <dl className="pd-facts">
                <div>
                  <dt>Reference</dt>
                  <dd>{product.sku || "—"}</dd>
                </div>
                <div>
                  <dt>Cost price</dt>
                  <dd>{formatProductMoney(product.costPrice)}</dd>
                </div>
                {forSale ? (
                  <div>
                    <dt>Selling price</dt>
                    <dd>{formatProductMoney(product.sellingPrice)}</dd>
                  </div>
                ) : (
                  <div>
                    <dt>Purpose</dt>
                    <dd>Operations (internal use)</dd>
                  </div>
                )}
                {margin !== null ? (
                  <div>
                    <dt>Margin</dt>
                    <dd className={cn(margin < 0 && "is-negative")}>{margin.toFixed(1)}%</dd>
                  </div>
                ) : null}
                {product.weight ? (
                  <div>
                    <dt>Weight</dt>
                    <dd>{product.weight}</dd>
                  </div>
                ) : null}
                {product.volume ? (
                  <div>
                    <dt>Volume</dt>
                    <dd>{product.volume}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="pd-desc">
                {product.description?.trim() ? (
                  <LineItemDescription boldTitle={false} details={product.description} title="" />
                ) : (
                  <Text as="p" tone="subdued" variant="bodySm">
                    No description yet.{" "}
                    <Link url={editUrl}>Add one</Link>
                  </Text>
                )}
              </div>
            </section>

            {/* Warranty */}
            <section className="pd-card">
              <div className="pd-card__head">
                <h3>
                  <ShieldCheck aria-hidden size={15} /> Warranty
                </h3>
                {productWarranties.length ? (
                  <Button url={`/dashboard/warranty?productId=${productId}`} variant="plain">
                    View all
                  </Button>
                ) : null}
              </div>
              <div className="pd-policy">
                <small>Default policy</small>
                <strong>
                  {defaultPolicy ? `${defaultPolicy.name} · ${defaultPolicy.durationMonths} months` : "None set"}
                </strong>
              </div>
              {activeWarranties.length ? (
                <ul className="pd-warranties">
                  {activeWarranties.slice(0, 5).map((warranty) => {
                    const months = defaultPolicy?.durationMonths ?? 12;
                    const pct = Math.max(0, Math.min(100, (warranty.daysLeft / (months * 30.4)) * 100));
                    return (
                      <li key={warranty.id}>
                        <NextLink href={`/dashboard/warranty/${warranty.id}`}>
                          <span>
                            <strong>{warranty.displayCustomerName}</strong>
                            <small>{warranty.serialNumber ? `SN ${warranty.serialNumber}` : "No serial"}</small>
                          </span>
                          <em className={cn(warranty.daysLeft <= 30 && "is-soon")}>{warranty.daysLeft} days left</em>
                        </NextLink>
                        <span className="pd-warranties__bar">
                          <b className={cn(warranty.daysLeft <= 30 && "is-soon")} style={{ width: `${pct}%` }} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Text as="p" tone="subdued" variant="bodySm">
                  {productWarranties.length
                    ? `No active warranties — ${productWarranties.length} expired, voided or pending.`
                    : "No warranty registrations yet."}
                </Text>
              )}
            </section>
          </aside>
        </div>
      </div>

      <Modal
        open={adjustOpen}
        primaryAction={{ content: "Save quantity", loading: adjustSaving, onAction: () => void handleAdjustStock() }}
        secondaryActions={[{ content: "Cancel", onAction: () => setAdjustOpen(false) }]}
        title="Set stock quantity"
        onClose={() => setAdjustOpen(false)}
      >
        <Modal.Section>
          <BlockStack gap="300">
            {adjustError ? <Banner tone="critical">{adjustError}</Banner> : null}
            <Select
              label="Warehouse"
              options={warehouses.map((warehouse) => ({ label: warehouse.name, value: warehouse.id }))}
              value={adjustWarehouseId}
              onChange={(id) => {
                setAdjustWarehouseId(id);
                const current = stockLevels.find((level) => level.warehouseId === id)?.quantity;
                setAdjustQuantity(current ? String(Number(current)) : "");
              }}
            />
            <TextField
              autoComplete="off"
              helpText="The new total on hand in this warehouse — not an amount to add."
              label="Quantity on hand"
              min={0}
              type="number"
              value={adjustQuantity}
              onChange={setAdjustQuantity}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={unitModalOpen}
        primaryAction={{ content: "Add serial", loading: unitSaving, onAction: () => void handleAddUnit() }}
        secondaryActions={[{ content: "Cancel", onAction: () => setUnitModalOpen(false) }]}
        title="Add serial number"
        onClose={() => setUnitModalOpen(false)}
      >
        <Modal.Section>
          <BlockStack gap="300">
            {unitError ? <Banner tone="critical">{unitError}</Banner> : null}
            <TextField autoComplete="off" autoFocus label="Serial number" value={unitSerial} onChange={setUnitSerial} />
            <Select
              label="Warehouse"
              options={warehouses.map((warehouse) => ({ label: warehouse.name, value: warehouse.id }))}
              value={unitWarehouseId}
              onChange={setUnitWarehouseId}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={archiveOpen}
        primaryAction={{ content: "Archive product", destructive: true, loading: archiving, onAction: () => void handleArchive() }}
        secondaryActions={[{ content: "Cancel", onAction: () => setArchiveOpen(false) }]}
        title={`Archive ${product.name}?`}
        onClose={() => setArchiveOpen(false)}
      >
        <Modal.Section>
          <Text as="p">
            It will be hidden from new quotes, orders and invoices. Existing documents, stock and serials stay as they are,
            and you can restore it any time.
          </Text>
        </Modal.Section>
      </Modal>

      <LinkComponentModal
        open={linkModalOpen}
        parentUnits={units}
        product={product}
        onClose={() => setLinkModalOpen(false)}
        onLinked={loadData}
      />

      <DeleteProductModal
        error={deleteError}
        loading={deleting}
        open={deleteOpen}
        productName={product.name}
        onClose={() => {
          if (deleting) return;
          setDeleteOpen(false);
          setDeleteError(null);
        }}
        onConfirm={() => void handlePermanentDelete()}
      />
    </AppPage>
  );
}
