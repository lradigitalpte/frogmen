"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  FormLayout,
  InlineGrid,
  InlineStack,
  Layout,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  Calendar,
  FileText,
  Package,
  ShieldCheck,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { WarrantyPolicyPicker } from "@/components/warranty/warranty-policy-picker";
import { listCustomers } from "@/lib/customers-api";
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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function DetailLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: string;
}) {
  return (
    <InlineStack gap="200" blockAlign="start" wrap={false}>
      <Box paddingBlockStart="050">
        <Icon aria-hidden className="text-muted-foreground" size={16} />
      </Box>
      <BlockStack gap="050">
        <Text as="span" tone="subdued" variant="bodySm">
          {label}
        </Text>
        <Text as="span" fontWeight="medium">
          {value}
        </Text>
      </BlockStack>
    </InlineStack>
  );
}

function ModePicker({
  selected,
  onSelect,
}: {
  selected: "sale" | "manual";
  onSelect: (mode: "sale" | "manual") => void;
}) {
  const options = [
    {
      id: "sale" as const,
      title: "From existing sale",
      description:
        "Find a posted invoice line in Frog and attach warranty coverage.",
    },
    {
      id: "manual" as const,
      title: "External sale",
      description:
        "Log warranty for equipment sold before Frog or outside the system.",
    },
  ];

  return (
    <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
      {options.map((option) => (
        <button
          key={option.id}
          className={cn(
            "w-full rounded-xl border-2 bg-card p-4 text-left transition-all",
            selected === option.id
              ? "border-primary bg-primary/5 ring-2 ring-primary/20"
              : "border-border hover:border-primary/40",
          )}
          type="button"
          onClick={() => onSelect(option.id)}
        >
          <BlockStack gap="150">
            <Text as="span" fontWeight="semibold" variant="headingSm">
              {option.title}
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              {option.description}
            </Text>
          </BlockStack>
        </button>
      ))}
    </InlineGrid>
  );
}

function SaleLineCard({
  item,
  selected,
  onSelect,
}: {
  item: SaleSearchResult;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={cn(
        "w-full rounded-xl border-2 bg-card p-4 text-left transition-all",
        selected
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border hover:border-primary/30",
      )}
      type="button"
      onClick={onSelect}
    >
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="start" gap="300">
          <BlockStack gap="100">
            <Text as="span" fontWeight="semibold">
              {item.productName ?? "Product"}
            </Text>
            <InlineStack gap="150" wrap>
              <Badge tone="info">{item.invoiceNumber}</Badge>
              {item.serialNumber ? (
                <Badge>{`SN ${item.serialNumber}`}</Badge>
              ) : null}
            </InlineStack>
          </BlockStack>
          {selected ? <Badge tone="success">Selected</Badge> : null}
        </InlineStack>
        <InlineStack gap="200" wrap>
          <Text as="span" tone="subdued" variant="bodySm">
            {item.customerName}
          </Text>
          <Text as="span" tone="subdued" variant="bodySm">
            ·
          </Text>
          <Text as="span" tone="subdued" variant="bodySm">
            Sold {formatDate(item.soldAt)}
          </Text>
        </InlineStack>
      </BlockStack>
    </button>
  );
}

function SelectedCard({
  title,
  subtitle,
  onClear,
}: {
  title: string;
  subtitle?: string;
  onClear: () => void;
}) {
  return (
    <Box
      background="bg-surface-secondary"
      borderRadius="200"
      padding="300"
    >
      <InlineStack align="space-between" blockAlign="start" gap="300">
        <BlockStack gap="050">
          <Text as="span" fontWeight="semibold">
            {title}
          </Text>
          {subtitle ? (
            <Text as="span" tone="subdued" variant="bodySm">
              {subtitle}
            </Text>
          ) : null}
        </BlockStack>
        <Button onClick={onClear} variant="plain">
          Change
        </Button>
      </InlineStack>
    </Box>
  );
}

export function RegisterWarrantyPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"sale" | "manual">("sale");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [policies, setPolicies] = useState<WarrantyPolicy[]>([]);

  const [saleSearch, setSaleSearch] = useState("");
  const [debouncedSaleSearch, setDebouncedSaleSearch] = useState("");
  const [saleResults, setSaleResults] = useState<SaleSearchResult[]>([]);
  const [saleLoading, setSaleLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleSearchResult | null>(null);
  const [salePolicyId, setSalePolicyId] = useState("");
  const [saleNotes, setSaleNotes] = useState("");

  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productName, setProductName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [soldAt, setSoldAt] = useState(todayIsoDate());
  const [manualPolicyId, setManualPolicyId] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualProductEntry, setManualProductEntry] = useState(false);
  const [manualCustomerEntry, setManualCustomerEntry] = useState(false);

  function clearProductSelection() {
    setSelectedProduct(null);
    setProductSearch("");
    setProductName("");
    setProducts([]);
    setManualProductEntry(false);
  }

  function clearCustomerSelection() {
    setSelectedCustomer(null);
    setCustomerSearch("");
    setCustomerName("");
    setCustomers([]);
    setManualCustomerEntry(false);
  }

  useEffect(() => {
    void listWarrantyPolicies({ perPage: 200 })
      .then((result) => setPolicies(result.data))
      .catch(() => setPolicies([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSaleSearch(saleSearch), 300);
    return () => clearTimeout(timer);
  }, [saleSearch]);

  const loadSales = useCallback(async () => {
    setSaleLoading(true);
    try {
      const result = await searchWarrantySales({
        search: debouncedSaleSearch || undefined,
        perPage: 25,
      });
      setSaleResults(result.data);
    } catch {
      setSaleResults([]);
    } finally {
      setSaleLoading(false);
    }
  }, [debouncedSaleSearch]);

  useEffect(() => {
    if (mode === "sale") {
      void loadSales();
    }
  }, [loadSales, mode]);

  useEffect(() => {
    if (selectedProduct || manualProductEntry || !productSearch.trim()) {
      setProducts([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await listProducts({
          search: productSearch.trim(),
          perPage: 8,
        });
        setProducts(result.data);
      } catch {
        setProducts([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [manualProductEntry, productSearch, selectedProduct]);

  useEffect(() => {
    if (selectedCustomer || manualCustomerEntry || !customerSearch.trim()) {
      setCustomers([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await listCustomers({
          search: customerSearch.trim(),
          perPage: 8,
        });
        setCustomers(result.data);
      } catch {
        setCustomers([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [customerSearch, manualCustomerEntry, selectedCustomer]);

  const selectedPolicy = useMemo(() => {
    const id = mode === "sale" ? salePolicyId : manualPolicyId;
    return policies.find((policy) => policy.id === id) ?? null;
  }, [manualPolicyId, mode, policies, salePolicyId]);

  const estimatedEndDate = useMemo(() => {
    if (!selectedPolicy) return null;
    const sold = mode === "sale" ? selectedSale?.soldAt : soldAt;
    if (!sold) return null;

    const [year, month, day] = sold.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCMonth(date.getUTCMonth() + selectedPolicy.durationMonths);
    return date.toISOString().slice(0, 10);
  }, [mode, selectedPolicy, selectedSale?.soldAt, soldAt]);

  function selectSale(item: SaleSearchResult) {
    setSelectedSale(item);
    setSalePolicyId(item.resolvedPolicyId ?? "");
    setError(null);
  }

  async function handleRegisterFromSale() {
    if (!selectedSale) {
      setError("Select a posted sale line first");
      return;
    }

    const policyId = salePolicyId || selectedSale.resolvedPolicyId || "";
    if (!policyId) {
      setError("Choose a warranty policy for this registration");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const warranty = await createWarranty({
        policyId,
        soldAt: selectedSale.soldAt,
        invoiceLineId: selectedSale.invoiceLineId,
        notes: saleNotes.trim() || undefined,
      });
      router.push(`/dashboard/warranty/${warranty.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register warranty");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegisterManual() {
    const resolvedProductName = selectedProduct?.name || productName.trim();
    const resolvedCustomerName = selectedCustomer?.name || customerName.trim();

    if (!resolvedProductName) {
      setError("Enter a product name or select a catalog product");
      return;
    }

    if (!resolvedCustomerName) {
      setError("Enter who it was sold to");
      return;
    }

    if (!soldAt) {
      setError("Sold date is required");
      return;
    }

    if (!manualPolicyId) {
      setError("Select a warranty policy");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const warranty = await createWarranty({
        policyId: manualPolicyId,
        soldAt,
        endsAt: endsAt || undefined,
        productId: selectedProduct?.id,
        productName: resolvedProductName,
        serialNumber: serialNumber.trim() || undefined,
        customerId: selectedCustomer?.id,
        customerName: resolvedCustomerName,
        notes: manualNotes.trim() || undefined,
      });
      router.push(`/dashboard/warranty/${warranty.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register warranty");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppPage
      backAction={{ content: "Warranty", url: "/dashboard/warranty" }}
      fullWidth
      subtitle="Attach warranty to a posted invoice or record coverage for a sale outside Frog."
      title="Register warranty"
    >
      <BlockStack gap="500">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              How are you registering this warranty?
            </Text>
            <ModePicker
              selected={mode}
              onSelect={(next) => {
                setMode(next);
                setError(null);
              }}
            />
          </BlockStack>
        </Card>

        {mode === "sale" ? (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      Find the sale
                    </Text>
                    <Text as="p" tone="subdued">
                      Search posted invoices by number, customer, product, or
                      serial number. Serial-tracked items show once   the
                      latest posted invoice   and lines already on warranty are
                      hidden.
                    </Text>
                  </BlockStack>

                  <TextField
                    autoComplete="off"
                    clearButton
                    label="Search"
                    labelHidden
                    onChange={setSaleSearch}
                    onClearButtonClick={() => setSaleSearch("")}
                    placeholder="Invoice #, customer, product, serial…"
                    value={saleSearch}
                  />

                  {saleLoading ? (
                    <Text as="p" tone="subdued">
                      Loading posted sales…
                    </Text>
                  ) : saleResults.length === 0 ? (
                    <EmptyState
                      heading="No posted sales found"
                      image=""
                    >
                      <p>
                        Try a different search term, or register coverage under
                        External sale if the equipment was not invoiced in Frog.
                      </p>
                    </EmptyState>
                  ) : (
                    <BlockStack gap="200">
                      <Text as="p" tone="subdued" variant="bodySm">
                        {saleResults.length} result
                        {saleResults.length === 1 ? "" : "s"}   select one line
                      </Text>
                      {saleResults.map((item) => (
                        <SaleLineCard
                          item={item}
                          key={item.invoiceLineId}
                          selected={
                            selectedSale?.invoiceLineId === item.invoiceLineId
                          }
                          onSelect={() => selectSale(item)}
                        />
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                <Card>
                  <BlockStack gap="400">
                    <InlineStack gap="200" blockAlign="center">
                      <ShieldCheck aria-hidden className="text-primary" size={20} />
                      <Text as="h2" variant="headingMd">
                        Warranty details
                      </Text>
                    </InlineStack>

                    {!selectedSale ? (
                      <Box
                        background="bg-surface-secondary"
                        borderRadius="200"
                        padding="400"
                      >
                        <Text as="p" tone="subdued">
                          Select a sale on the left to review product, customer,
                          and sold date before registering warranty.
                        </Text>
                      </Box>
                    ) : (
                      <BlockStack gap="300">
                        <DetailLine
                          icon={Package}
                          label="Product"
                          value={selectedSale.productName ?? "Product"}
                        />
                        {selectedSale.serialNumber ? (
                          <DetailLine
                            icon={Package}
                            label="Serial number"
                            value={selectedSale.serialNumber}
                          />
                        ) : null}
                        <DetailLine
                          icon={User}
                          label="Customer"
                          value={selectedSale.customerName}
                        />
                        <DetailLine
                          icon={FileText}
                          label="Invoice"
                          value={selectedSale.invoiceNumber}
                        />
                        <DetailLine
                          icon={Calendar}
                          label="Sold date"
                          value={formatDate(selectedSale.soldAt)}
                        />

                        {!selectedSale.resolvedPolicyId && !salePolicyId ? (
                          <Banner tone="warning">
                            No default policy on this product or line. Pick a
                            warranty policy below.
                          </Banner>
                        ) : null}

                        <WarrantyPolicyPicker
                          helpText="Pre-filled from the quotation line or product default when available."
                          onChange={setSalePolicyId}
                          value={salePolicyId}
                        />

                        {selectedPolicy && estimatedEndDate && !endsAt ? (
                          <Box
                            background="bg-surface-secondary"
                            borderRadius="200"
                            padding="300"
                          >
                            <Text as="p" tone="subdued" variant="bodySm">
                              Coverage ends{" "}
                              <Text as="span" fontWeight="semibold">
                                {formatDate(estimatedEndDate)}
                              </Text>{" "}
                              ({selectedPolicy.durationMonths} months from sold
                              date)
                            </Text>
                          </Box>
                        ) : null}

                        <TextField
                          autoComplete="off"
                          label="Notes (optional)"
                          multiline={3}
                          onChange={setSaleNotes}
                          placeholder="Reference number, special terms…"
                          value={saleNotes}
                        />

                        <Button
                          disabled={!selectedSale}
                          fullWidth
                          loading={saving}
                          onClick={() => void handleRegisterFromSale()}
                          variant="primary"
                        >
                          Register warranty
                        </Button>
                      </BlockStack>
                    )}
                  </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>
          </Layout>
        ) : (
          <Layout>
            <Layout.Section>
              <BlockStack gap="400">
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Product
                    </Text>

                    {selectedProduct ? (
                      <BlockStack gap="300">
                        <SelectedCard
                          subtitle={selectedProduct.sku ?? undefined}
                          title={selectedProduct.name}
                          onClear={clearProductSelection}
                        />
                        <TextField
                          autoComplete="off"
                          label="Serial number"
                          onChange={setSerialNumber}
                          placeholder="Optional"
                          value={serialNumber}
                        />
                      </BlockStack>
                    ) : manualProductEntry ? (
                      <BlockStack gap="300">
                        <FormLayout>
                          <TextField
                            autoComplete="off"
                            label="Product name"
                            onChange={setProductName}
                            value={productName}
                          />
                          <TextField
                            autoComplete="off"
                            label="Serial number"
                            onChange={setSerialNumber}
                            placeholder="Optional"
                            value={serialNumber}
                          />
                        </FormLayout>
                        <Button
                          onClick={() => {
                            setManualProductEntry(false);
                            setProductName("");
                          }}
                          variant="plain"
                        >
                          Search catalog instead
                        </Button>
                      </BlockStack>
                    ) : (
                      <BlockStack gap="300">
                        <TextField
                          autoComplete="off"
                          label="Search catalog"
                          onChange={setProductSearch}
                          placeholder="Type to search products…"
                          value={productSearch}
                        />

                        {products.length > 0 ? (
                          <BlockStack gap="150">
                            {products.map((product) => (
                              <button
                                key={product.id}
                                className="w-full rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-primary/40"
                                type="button"
                                onClick={() => {
                                  setSelectedProduct(product);
                                  setProductName(product.name);
                                  setProductSearch("");
                                  setProducts([]);
                                  if (product.defaultWarrantyPolicyId) {
                                    setManualPolicyId(
                                      product.defaultWarrantyPolicyId,
                                    );
                                  }
                                }}
                              >
                                <Text as="span" fontWeight="medium">
                                  {product.name}
                                </Text>
                                {product.sku ? (
                                  <Text as="span" tone="subdued" variant="bodySm">
                                    {" "}
                                    · {product.sku}
                                  </Text>
                                ) : null}
                              </button>
                            ))}
                          </BlockStack>
                        ) : null}

                        <Button
                          onClick={() => setManualProductEntry(true)}
                          variant="plain"
                        >
                          Product not in catalog
                        </Button>
                      </BlockStack>
                    )}
                  </BlockStack>
                </Card>

                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Customer
                    </Text>

                    {selectedCustomer ? (
                      <SelectedCard
                        title={selectedCustomer.name}
                        onClear={clearCustomerSelection}
                      />
                    ) : manualCustomerEntry ? (
                      <BlockStack gap="300">
                        <TextField
                          autoComplete="off"
                          label="Sold to"
                          onChange={setCustomerName}
                          placeholder="Customer or company name"
                          value={customerName}
                        />
                        <Button
                          onClick={() => {
                            setManualCustomerEntry(false);
                            setCustomerName("");
                          }}
                          variant="plain"
                        >
                          Search contacts instead
                        </Button>
                      </BlockStack>
                    ) : (
                      <BlockStack gap="300">
                        <TextField
                          autoComplete="off"
                          label="Search contacts"
                          onChange={setCustomerSearch}
                          placeholder="Type to search customers…"
                          value={customerSearch}
                        />

                        {customers.length > 0 ? (
                          <BlockStack gap="150">
                            {customers.map((customer) => (
                              <button
                                key={customer.id}
                                className="w-full rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-primary/40"
                                type="button"
                                onClick={() => {
                                  setSelectedCustomer(customer);
                                  setCustomerName(customer.name);
                                  setCustomerSearch("");
                                  setCustomers([]);
                                }}
                              >
                                <Text as="span" fontWeight="medium">
                                  {customer.name}
                                </Text>
                              </button>
                            ))}
                          </BlockStack>
                        ) : null}

                        <Button
                          onClick={() => setManualCustomerEntry(true)}
                          variant="plain"
                        >
                          Customer not in Frog
                        </Button>
                      </BlockStack>
                    )}
                  </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Warranty terms
                  </Text>

                  <FormLayout>
                    <TextField
                      autoComplete="off"
                      label="Date sold"
                      onChange={setSoldAt}
                      type="date"
                      value={soldAt}
                    />
                  </FormLayout>

                  <WarrantyPolicyPicker
                    allowNone={false}
                    onChange={setManualPolicyId}
                    value={manualPolicyId}
                  />

                  {selectedPolicy && estimatedEndDate && !endsAt ? (
                    <Box
                      background="bg-surface-secondary"
                      borderRadius="200"
                      padding="300"
                    >
                      <Text as="p" tone="subdued" variant="bodySm">
                        Coverage ends{" "}
                        <Text as="span" fontWeight="semibold">
                          {formatDate(estimatedEndDate)}
                        </Text>
                      </Text>
                    </Box>
                  ) : null}

                  <TextField
                    autoComplete="off"
                    helpText="Only if remaining coverage differs from the full policy."
                    label="End date override"
                    onChange={setEndsAt}
                    type="date"
                    value={endsAt}
                  />

                  <TextField
                    autoComplete="off"
                    label="Notes (optional)"
                    multiline={3}
                    onChange={setManualNotes}
                    placeholder="Where it was sold, PO reference…"
                    value={manualNotes}
                  />

                  <Button
                    fullWidth
                    loading={saving}
                    onClick={() => void handleRegisterManual()}
                    variant="primary"
                  >
                    Register warranty
                  </Button>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}
      </BlockStack>
    </AppPage>
  );
}
