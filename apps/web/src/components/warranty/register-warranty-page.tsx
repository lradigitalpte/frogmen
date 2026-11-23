"use client";

import { Badge, Banner, Button, FormLayout, Icon, SkeletonBodyText, TextField } from "@shopify/polaris";
import {
  CheckCircleIcon,
  OrderIcon,
  PersonIcon,
  ProductIcon,
  SearchIcon,
  ShieldCheckMarkIcon,
} from "@shopify/polaris-icons";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { CustomerPicker } from "@/components/sales/customer-picker";
import { WarrantyPolicyPicker } from "@/components/warranty/warranty-policy-picker";
import { formatAppDate } from "@/lib/format-date";
import { listProducts } from "@/lib/products-api";
import { cn } from "@/lib/utils";
import {
  createWarranty,
  listWarrantyPolicies,
  searchWarrantySales,
  type SaleSearchResult,
  type WarrantyPolicy,
} from "@/lib/warranty-api";
import type { Customer } from "@/types/customer";
import type { Product } from "@/types/product";

type Mode = "sale" | "manual";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return formatAppDate(value) || value;
}

function addMonths(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

function durationLabel(months: number) {
  if (months % 12 === 0) return `${months / 12} year${months === 12 ? "" : "s"}`;
  return `${months} month${months === 1 ? "" : "s"}`;
}

const isIsoDate = (v: string) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export function RegisterWarrantyPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sale");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [policies, setPolicies] = useState<WarrantyPolicy[]>([]);

  // Existing sale
  const [saleSearch, setSaleSearch] = useState("");
  const [debouncedSaleSearch, setDebouncedSaleSearch] = useState("");
  const [saleResults, setSaleResults] = useState<SaleSearchResult[]>([]);
  const [saleLoading, setSaleLoading] = useState(true);
  const [saleLoaded, setSaleLoaded] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleSearchResult | null>(null);
  const [salePolicyId, setSalePolicyId] = useState("");
  const [saleNotes, setSaleNotes] = useState("");
  const saleRequest = useRef(0);

  // External sale
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [productSearching, setProductSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [manualProductEntry, setManualProductEntry] = useState(false);
  const [productName, setProductName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [manualCustomerEntry, setManualCustomerEntry] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [soldAt, setSoldAt] = useState(todayIsoDate());
  const [manualPolicyId, setManualPolicyId] = useState("");
  const [overrideEnd, setOverrideEnd] = useState(false);
  const [endsAt, setEndsAt] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    void listWarrantyPolicies({ perPage: 200 })
      .then((result) => setPolicies(result.data))
      .catch(() => setPolicies([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSaleSearch(saleSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [saleSearch]);

  const loadSales = useCallback(async () => {
    const request = ++saleRequest.current;
    setSaleLoading(true);
    try {
      const result = await searchWarrantySales({ search: debouncedSaleSearch || undefined, perPage: 25 });
      if (request !== saleRequest.current) return;
      setSaleResults(result.data);
    } catch (err) {
      if (request !== saleRequest.current) return;
      setSaleResults([]);
      setError(err instanceof Error ? err.message : "Couldn't search sales");
    } finally {
      if (request === saleRequest.current) {
        setSaleLoading(false);
        setSaleLoaded(true);
      }
    }
  }, [debouncedSaleSearch]);

  useEffect(() => {
    if (mode === "sale") void loadSales();
  }, [loadSales, mode]);

  useEffect(() => {
    const term = productSearch.trim();
    if (selectedProduct || manualProductEntry || !term) {
      setProductResults([]);
      setProductSearching(false);
      return;
    }
    setProductSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await listProducts({ search: term, perPage: 8 });
        if (!cancelled) setProductResults(result.data);
      } catch {
        if (!cancelled) setProductResults([]);
      } finally {
        if (!cancelled) setProductSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [manualProductEntry, productSearch, selectedProduct]);

  const policyById = useMemo(() => new Map(policies.map((p) => [p.id, p])), [policies]);

  // ----- derived: sale mode -----
  const salePolicy = policyById.get(salePolicyId) ?? null;
  const saleEnds = selectedSale && salePolicy ? addMonths(selectedSale.soldAt, salePolicy.durationMonths) : null;

  // ----- derived: manual mode -----
  const manualPolicy = policyById.get(manualPolicyId) ?? null;
  const today = todayIsoDate();
  const soldValid = isIsoDate(soldAt);
  const soldError = !soldAt
    ? "Enter the date it was sold"
    : !soldValid
      ? "Enter a valid date"
      : soldAt > today
        ? "Sold date can't be in the future"
        : undefined;
  const policyEnds = manualPolicy && soldValid ? addMonths(soldAt, manualPolicy.durationMonths) : null;
  const manualEnds = overrideEnd && endsAt ? endsAt : policyEnds;
  const endError =
    overrideEnd && endsAt
      ? !isIsoDate(endsAt)
        ? "Enter a valid date"
        : soldValid && endsAt < soldAt
          ? "End date can't be before the sold date"
          : undefined
      : undefined;
  const resolvedProductName = selectedProduct?.name ?? productName.trim();
  const resolvedCustomerName = customer?.name ?? customerName.trim();
  const productError = resolvedProductName ? undefined : "Pick a product or type its name";
  const customerError = resolvedCustomerName ? undefined : "Pick a customer or type who bought it";
  const policyError = manualPolicyId ? undefined : "Choose a warranty policy";
  const manualErrors = [productError, customerError, soldError, policyError, endError].filter(Boolean);

  function chooseMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  function selectSale(item: SaleSearchResult) {
    setSelectedSale(item);
    setSalePolicyId(item.resolvedPolicyId ?? "");
    setError(null);
  }

  function pickProduct(product: Product) {
    setSelectedProduct(product);
    setProductSearch("");
    setProductResults([]);
    if (product.defaultWarrantyPolicyId && !manualPolicyId) setManualPolicyId(product.defaultWarrantyPolicyId);
  }

  function clearProduct() {
    setSelectedProduct(null);
    setManualProductEntry(false);
    setProductName("");
    setProductSearch("");
  }

  async function handleRegisterFromSale() {
    if (!selectedSale) return;
    if (!salePolicyId) {
      setError("Choose a warranty policy for this sale");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const warranty = await createWarranty({
        policyId: salePolicyId,
        soldAt: selectedSale.soldAt,
        invoiceLineId: selectedSale.invoiceLineId,
        notes: saleNotes.trim() || undefined,
      });
      router.push(`/dashboard/warranty/${warranty.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register warranty");
      setSaving(false);
    }
  }

  async function handleRegisterManual() {
    setTouched(true);
    if (manualErrors.length > 0) {
      setError(manualErrors[0] ?? null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const warranty = await createWarranty({
        policyId: manualPolicyId,
        soldAt,
        endsAt: overrideEnd && endsAt ? endsAt : undefined,
        productId: selectedProduct?.id,
        productName: resolvedProductName,
        serialNumber: serialNumber.trim() || undefined,
        customerId: customer?.id,
        customerName: resolvedCustomerName,
        notes: manualNotes.trim() || undefined,
      });
      router.push(`/dashboard/warranty/${warranty.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register warranty");
      setSaving(false);
    }
  }

  // ----- preview card shared by both modes -----
  const preview =
    mode === "sale"
      ? {
          product: selectedSale?.productName ?? null,
          serial: selectedSale?.serialNumber ?? null,
          customer: selectedSale?.customerName ?? null,
          sold: selectedSale?.soldAt ?? null,
          ends: saleEnds,
          policy: salePolicy,
        }
      : {
          product: resolvedProductName || null,
          serial: serialNumber.trim() || null,
          customer: resolvedCustomerName || null,
          sold: soldValid ? soldAt : null,
          ends: endError ? null : manualEnds,
          policy: manualPolicy,
        };
  const previewDaysLeft = preview.ends ? daysBetween(today, preview.ends) : null;
  const previewExpired = previewDaysLeft !== null && previewDaysLeft < 0;
  const coverUsed =
    preview.sold && preview.ends && preview.ends > preview.sold
      ? Math.min(100, Math.max(0, (daysBetween(preview.sold, today) / daysBetween(preview.sold, preview.ends)) * 100))
      : 0;

  const previewCard = (
    <section className="pl-hero rw-preview">
      <span className="pl-hero__label">Warranty preview</span>
      <strong className="rw-preview__product">{preview.product ?? "No product yet"}</strong>
      {preview.serial ? <span className="rw-preview__serial">SN {preview.serial}</span> : null}

      <dl className="rw-preview__facts">
        <div>
          <dt>Customer</dt>
          <dd>{preview.customer ?? "—"}</dd>
        </div>
        <div>
          <dt>Sold</dt>
          <dd>{formatDate(preview.sold)}</dd>
        </div>
        <div>
          <dt>Policy</dt>
          <dd>{preview.policy ? `${preview.policy.name}` : "—"}</dd>
        </div>
        <div>
          <dt>Ends</dt>
          <dd>{formatDate(preview.ends)}</dd>
        </div>
      </dl>

      {preview.ends && preview.sold ? (
        <div className="wd-progress">
          <div className={cn("wd-progress__bar", previewExpired ? "is-out" : previewDaysLeft! <= 30 ? "is-low" : "is-ok")}>
            <b style={{ width: `${coverUsed}%` }} />
          </div>
          <span className="rw-preview__note">
            {previewExpired
              ? `Already expired ${Math.abs(previewDaysLeft!)} days ago. It will be saved as expired.`
              : `${previewDaysLeft!.toLocaleString()} days of cover left from today.`}
          </span>
        </div>
      ) : (
        <span className="rw-preview__note">
          {mode === "sale" ? "Pick a sale and a policy to see the cover dates." : "Fill in the sale and pick a policy to see the cover dates."}
        </span>
      )}
    </section>
  );

  return (
    <AppPage
      backAction={{ content: "Warranty", url: "/dashboard/warranty" }}
      fullWidth
      subtitle="Add warranty cover to an invoice in Frog, or record a sale made outside it."
      title="Register warranty"
    >
      <div className="pl rw">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <div className="rw-modes" role="radiogroup" aria-label="How are you registering this warranty?">
          {(
            [
              {
                id: "sale",
                icon: OrderIcon,
                title: "From an invoice in Frog",
                text: "Pick a posted invoice line. Product, customer and sold date fill in for you.",
              },
              {
                id: "manual",
                icon: ProductIcon,
                title: "Sold outside Frog",
                text: "For equipment sold before Frog or through another system.",
              },
            ] as const
          ).map((option) => (
            <button
              aria-checked={mode === option.id}
              className={cn("rw-mode", mode === option.id && "is-active")}
              key={option.id}
              role="radio"
              type="button"
              onClick={() => chooseMode(option.id)}
            >
              <span className="rw-mode__icon">
                <Icon source={option.icon} />
              </span>
              <span className="rw-mode__text">
                <strong>{option.title}</strong>
                <small>{option.text}</small>
              </span>
              <span className="rw-mode__check" aria-hidden>
                {mode === option.id ? <Icon source={CheckCircleIcon} /> : null}
              </span>
            </button>
          ))}
        </div>

        {mode === "sale" ? (
          <div className="rw-layout">
            <section className="ex-surface">
              <div className="rw-section-head ex-pad">
                <h2>Find the sale</h2>
                <p>
                  Search posted invoices by number, customer, product or serial. Lines that already have a warranty are
                  hidden, and each serial shows once, from its latest invoice.
                </p>
                <TextField
                  autoComplete="off"
                  clearButton
                  label="Search sales"
                  labelHidden
                  placeholder="Invoice number, customer, product or serial"
                  prefix={<Icon source={SearchIcon} />}
                  value={saleSearch}
                  onChange={setSaleSearch}
                  onClearButtonClick={() => setSaleSearch("")}
                />
              </div>

              {saleLoading && !saleLoaded ? (
                <div className="ex-pad">
                  <SkeletonBodyText lines={6} />
                </div>
              ) : saleResults.length === 0 ? (
                <div className="ex-empty">
                  <span className="ex-empty__icon">
                    <Icon source={debouncedSaleSearch ? SearchIcon : CheckCircleIcon} />
                  </span>
                  <strong>
                    {debouncedSaleSearch ? `No sales match “${debouncedSaleSearch}”` : "Every posted sale already has a warranty"}
                  </strong>
                  <p>
                    {debouncedSaleSearch
                      ? "Try the invoice number or serial. If it was never invoiced in Frog, record it as sold outside Frog."
                      : "Warranties are created automatically when an invoice posts, so there's nothing left to add here."}
                  </p>
                  <div className="wp-empty-actions">
                    <Button onClick={() => chooseMode("manual")}>Record a sale outside Frog</Button>
                    <Button url="/dashboard/warranty" variant="tertiary">
                      View warranties
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="rw-count">
                    {saleResults.length === 25 ? "Showing the 25 most recent matches" : `${saleResults.length} sale line${saleResults.length === 1 ? "" : "s"}`}
                  </p>
                  <ul className={cn("rw-sales", saleLoading && "st-dim")} role="radiogroup" aria-label="Sale lines">
                    {saleResults.map((item) => {
                      const active = selectedSale?.invoiceLineId === item.invoiceLineId;
                      const defaultPolicy = item.resolvedPolicyId ? policyById.get(item.resolvedPolicyId) : undefined;
                      return (
                        <li key={item.invoiceLineId}>
                          <button
                            aria-checked={active}
                            className={cn("rw-sale", active && "is-active")}
                            role="radio"
                            type="button"
                            onClick={() => selectSale(item)}
                          >
                            <span className="rw-radio" aria-hidden />
                            <span className="rw-sale__main">
                              <strong>{item.productName ?? "Product"}</strong>
                              <span>
                                <code>{item.invoiceNumber}</code>
                                {item.serialNumber ? <code>SN {item.serialNumber}</code> : null}
                                {Number(item.quantity) > 1 ? <code>× {Number(item.quantity)}</code> : null}
                              </span>
                            </span>
                            <span className="rw-sale__who">
                              <strong>{item.customerName}</strong>
                              <small>Sold {formatDate(item.soldAt)}</small>
                            </span>
                            <span className="rw-sale__policy">
                              {defaultPolicy ? (
                                <Badge tone="info">{defaultPolicy.name}</Badge>
                              ) : (
                                <Badge tone="attention">No default policy</Badge>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>

            <aside className="rw-side">
              {previewCard}
              <section className="ex-surface ex-pad rw-terms">
                <h2 className="wd-card__title">Cover terms</h2>
                {!selectedSale ? (
                  <p className="wd-hint rw-terms__empty">Pick a sale line on the left first.</p>
                ) : (
                  <FormLayout>
                    {!selectedSale.resolvedPolicyId ? (
                      <Banner tone="warning">This product has no default policy. Pick one below.</Banner>
                    ) : null}
                    <WarrantyPolicyPicker
                      allowNone={false}
                      helpText="Filled in from the order line or the product's default when there is one."
                      value={salePolicyId}
                      onChange={setSalePolicyId}
                    />
                    {salePolicy ? (
                      <p className="wd-hint rw-terms__line">
                        {`${durationLabel(salePolicy.durationMonths)} from the sold date, ${formatDate(selectedSale.soldAt)}. Confirm delivery later to count it from the delivery date instead.`}
                      </p>
                    ) : null}
                    <TextField
                      autoComplete="off"
                      label="Notes"
                      multiline={3}
                      placeholder="Reference number, special terms…"
                      value={saleNotes}
                      onChange={setSaleNotes}
                    />
                  </FormLayout>
                )}
                <div className="rw-submit">
                  <Button
                    disabled={!selectedSale || !salePolicyId}
                    fullWidth
                    loading={saving}
                    variant="primary"
                    onClick={() => void handleRegisterFromSale()}
                  >
                    Register warranty
                  </Button>
                </div>
              </section>
            </aside>
          </div>
        ) : (
          <div className="rw-layout">
            <div className="rw-main">
              <section className="ex-surface ex-pad">
                <div className="rw-step">
                  <span className="rw-step__num">1</span>
                  <h2>Product</h2>
                </div>
                {selectedProduct ? (
                  <div className="rw-picked">
                    <span className="wd-links__icon">
                      <Icon source={ProductIcon} />
                    </span>
                    <span className="wd-links__text">
                      <strong>{selectedProduct.name}</strong>
                      <small>{selectedProduct.sku ?? "No SKU"}</small>
                    </span>
                    <Button variant="plain" onClick={clearProduct}>
                      Change
                    </Button>
                  </div>
                ) : manualProductEntry ? (
                  <TextField
                    autoComplete="off"
                    error={touched ? productError : undefined}
                    label="Product name"
                    placeholder="e.g. Chasing M2 Pro"
                    value={productName}
                    onChange={setProductName}
                  />
                ) : (
                  <div className="rw-search">
                    <TextField
                      autoComplete="off"
                      clearButton
                      error={touched ? productError : undefined}
                      label="Search your catalog"
                      placeholder="Product name or SKU"
                      prefix={<Icon source={SearchIcon} />}
                      value={productSearch}
                      onChange={setProductSearch}
                      onClearButtonClick={() => setProductSearch("")}
                    />
                    {productSearch.trim() ? (
                      <ul className="rw-options">
                        {productSearching && productResults.length === 0 ? (
                          <li className="rw-options__empty">Searching…</li>
                        ) : productResults.length === 0 ? (
                          <li className="rw-options__empty">No products match. Type the name by hand instead.</li>
                        ) : (
                          productResults.map((product) => (
                            <li key={product.id}>
                              <button type="button" onClick={() => pickProduct(product)}>
                                <strong>{product.name}</strong>
                                <small>{product.sku ?? ""}</small>
                                {product.defaultWarrantyPolicyId && policyById.get(product.defaultWarrantyPolicyId) ? (
                                  <Badge tone="info">{policyById.get(product.defaultWarrantyPolicyId)!.name}</Badge>
                                ) : null}
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    ) : null}
                  </div>
                )}
                <div className="rw-row-actions">
                  {selectedProduct ? null : manualProductEntry ? (
                    <Button variant="plain" onClick={() => setManualProductEntry(false)}>
                      Search the catalog instead
                    </Button>
                  ) : (
                    <Button
                      variant="plain"
                      onClick={() => {
                        setManualProductEntry(true);
                        setProductName(productSearch.trim());
                      }}
                    >
                      It&apos;s not in the catalog
                    </Button>
                  )}
                </div>
                <div className="rw-gap">
                  <TextField
                    autoComplete="off"
                    helpText="Optional, but it lets you find this warranty by serial later."
                    label="Serial number"
                    value={serialNumber}
                    onChange={setSerialNumber}
                  />
                </div>
              </section>

              <section className="ex-surface ex-pad">
                <div className="rw-step">
                  <span className="rw-step__num">2</span>
                  <h2>Customer</h2>
                </div>
                {manualCustomerEntry ? (
                  <TextField
                    autoComplete="off"
                    error={touched ? customerError : undefined}
                    label="Sold to"
                    placeholder="Customer or company name"
                    value={customerName}
                    onChange={setCustomerName}
                  />
                ) : (
                  <CustomerPicker
                    allowClear
                    error={touched ? customerError : undefined}
                    label="Customer"
                    value={customer}
                    onChange={setCustomer}
                  />
                )}
                <div className="rw-row-actions">
                  <Button
                    variant="plain"
                    onClick={() => {
                      setManualCustomerEntry((v) => !v);
                      setCustomer(null);
                      setCustomerName("");
                    }}
                  >
                    {manualCustomerEntry ? "Pick a customer from Frog instead" : "They're not a customer in Frog"}
                  </Button>
                </div>
              </section>

              <section className="ex-surface ex-pad">
                <div className="rw-step">
                  <span className="rw-step__num">3</span>
                  <h2>Cover terms</h2>
                </div>
                <FormLayout>
                  <FormLayout.Group>
                    <TextField
                      autoComplete="off"
                      error={touched || soldAt > today ? soldError : undefined}
                      label="Date sold"
                      max={today}
                      type="date"
                      value={soldAt}
                      onChange={setSoldAt}
                    />
                    <WarrantyPolicyPicker allowNone={false} value={manualPolicyId} onChange={setManualPolicyId} />
                  </FormLayout.Group>
                  {touched && policyError ? <p className="rw-error">{policyError}</p> : null}
                  <div>
                    <Button
                      disclosure={overrideEnd ? "up" : "down"}
                      variant="plain"
                      onClick={() => {
                        setOverrideEnd((v) => !v);
                        setEndsAt("");
                      }}
                    >
                      {overrideEnd ? "Use the policy length" : "Set a different end date"}
                    </Button>
                  </div>
                  {overrideEnd ? (
                    <TextField
                      autoComplete="off"
                      error={endError}
                      helpText={
                        policyEnds
                          ? `The policy alone would end on ${formatDate(policyEnds)}. Use this when the remaining cover is different.`
                          : "Use this when the remaining cover differs from the full policy."
                      }
                      label="End date"
                      min={soldValid ? soldAt : undefined}
                      type="date"
                      value={endsAt}
                      onChange={setEndsAt}
                    />
                  ) : null}
                  <TextField
                    autoComplete="off"
                    label="Notes"
                    multiline={3}
                    placeholder="Where it was sold, PO reference…"
                    value={manualNotes}
                    onChange={setManualNotes}
                  />
                </FormLayout>
              </section>
            </div>

            <aside className="rw-side">
              {previewCard}
              <section className="ex-surface ex-pad rw-terms">
                <ul className="rw-checklist">
                  <li className={cn(!productError && "is-done")}>
                    <Icon source={ProductIcon} /> Product
                  </li>
                  <li className={cn(!customerError && "is-done")}>
                    <Icon source={PersonIcon} /> Customer
                  </li>
                  <li className={cn(!soldError && !policyError && !endError && "is-done")}>
                    <Icon source={ShieldCheckMarkIcon} /> Sold date and policy
                  </li>
                </ul>
                <div className="rw-submit">
                  <Button fullWidth loading={saving} variant="primary" onClick={() => void handleRegisterManual()}>
                    Register warranty
                  </Button>
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>
    </AppPage>
  );
}
