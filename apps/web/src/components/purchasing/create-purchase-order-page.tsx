"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  Modal,
  Text,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AppPage } from "@/components/layout/page";
import type { AddPurchaseOrderLineInput } from "@/components/purchasing/add-purchase-order-line-modal";
import { PurchaseOrderCatalogSection } from "@/components/purchasing/purchase-order-catalog-section";
import {
  PurchaseOrderAdditionalChargesForm,
  PurchaseOrderFreightForm,
  PurchaseOrderVendorDiscountForm,
} from "@/components/purchasing/purchase-order-charges-form";
import { EditPurchaseOrderLineModal } from "@/components/purchasing/edit-purchase-order-line-modal";
import { PurchaseOrderDraftLinesList } from "@/components/purchasing/purchase-order-draft-lines-list";
import { PurchaseOrderContextCard } from "@/components/purchasing/purchase-order-context-card";
import { PurchaseOrderVendorTermsForm } from "@/components/purchasing/purchase-order-vendor-terms-form";
import type { PurchaseOrderDraftLine } from "@/components/purchasing/purchase-order-draft-lines-table";
import {
  PurchaseOrderHeaderForm,
  type PurchaseOrderHeaderValues,
} from "@/components/purchasing/purchase-order-header-form";
import { PurchaseOrderMarginPreview } from "@/components/purchasing/purchase-order-margin-preview";
import { PurchaseOrderTotalsSummary } from "@/components/purchasing/purchase-order-totals-summary";
import type { PurchaseOrderChargeBreakdownItem } from "@/components/purchasing/purchase-order-totals-summary";
import { todayIsoDate } from "@/components/sales/format-money";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  applyOrderVendorDiscountToLines,
  buildPurchaseOrderChargesPayload,
  computePurchaseOrderTotals,
  emptyPurchaseOrderCharges,
  type PurchaseOrderChargeValues,
} from "@/lib/purchase-order-utils";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
} from "@/lib/purchase-orders-api";
import { listWarehouses } from "@/lib/warehouses-api";
import { getVendor } from "@/lib/vendors-api";
import type { Warehouse } from "@/types/warehouse";
import { useToast } from "@/components/providers/toast-provider";

const STEPS = [
  { title: "Vendor & details", hint: "Vendor, currency, dates, terms and freight" },
  { title: "Products & charges", hint: "Lines, discounts, fees and margin check" },
];

function emptyHeader(): PurchaseOrderHeaderValues {
  return {
    vendor: null,
    currencyId: "",
    orderDate: todayIsoDate(),
    expectedDate: "",
    vendorReference: "",
    internalReference: "",
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
    reload: reloadCurrencies,
  } = useOrgCurrency();
  const [selectedTab, setSelectedTab] = useState(0);
  const [header, setHeader] = useState<PurchaseOrderHeaderValues>(emptyHeader);
  const [vendorNotes, setVendorNotes] = useState("");
  const [charges, setCharges] = useState<PurchaseOrderChargeValues>(
    emptyPurchaseOrderCharges(),
  );
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [lines, setLines] = useState<PurchaseOrderDraftLine[]>([]);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [triedNext, setTriedNext] = useState(false);
  const [pendingCurrencyId, setPendingCurrencyId] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const savedRef = useRef(false);

  const dirty =
    Boolean(header.vendor) ||
    lines.length > 0 ||
    Boolean(header.vendorReference || header.internalReference || header.expectedDate);

  // Warn before closing the tab or reloading with an unsaved order.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      if (savedRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  /** Header changes go through here so a currency switch with lines can be confirmed first. */
  function changeHeader(next: PurchaseOrderHeaderValues) {
    if (lines.length > 0 && next.currencyId && next.currencyId !== header.currencyId) {
      setPendingCurrencyId(next.currencyId);
      setHeader({ ...next, currencyId: header.currencyId });
      return;
    }
    setHeader(next);
  }

  useEffect(() => {
    if (!baseCurrency?.id) return;
    setHeader((current) =>
      current.currencyId ? current : { ...current, currencyId: baseCurrency.id },
    );
  }, [baseCurrency?.id]);

  // Opened from a vendor ("New PO" on the vendors list): pre-select that vendor.
  useEffect(() => {
    const vendorId = new URLSearchParams(window.location.search).get("vendor");
    if (!vendorId) return;
    void getVendor(vendorId)
      .then((vendor) => {
        if (vendor.deletedAt) return;
        setHeader((current) => (current.vendor ? current : { ...current, vendor }));
      })
      .catch(() => undefined);
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

  const chargesPayload = useMemo(
    () => buildPurchaseOrderChargesPayload(charges),
    [charges],
  );

  const pricedLines = useMemo(
    () => applyOrderVendorDiscountToLines(lines, chargesPayload),
    [lines, chargesPayload],
  );

  const totals = useMemo(
    () =>
      computePurchaseOrderTotals(
        lines.map((line) => ({
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: 0,
          discountAmount: 0,
        })),
        chargesPayload,
      ),
    [lines, chargesPayload],
  );

  const discountPercentLabel = useMemo(() => {
    const headerPercent = Number(chargesPayload.discountPercent ?? 0);
    if (headerPercent > 0) {
      return headerPercent;
    }
    if (totals.lineDiscount <= 0 || totals.lineGross <= 0) {
      return null;
    }
    return Number(((totals.lineDiscount / totals.lineGross) * 100).toFixed(2));
  }, [chargesPayload.discountPercent, totals.lineDiscount, totals.lineGross]);

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

  function mapChargesToServerLines(
    draftLines: PurchaseOrderDraftLine[],
    serverLines: NonNullable<Awaited<ReturnType<typeof createPurchaseOrder>>["lines"]>,
  ) {
    const draftToServer = new Map<string, string>();
    draftLines.forEach((draftLine, index) => {
      const serverLine = serverLines[index];
      if (serverLine) {
        draftToServer.set(draftLine.id, serverLine.id);
      }
    });

    return (chargesPayload.additionalCharges ?? [])
      .map((charge) => ({
        ...charge,
        purchaseOrderLineId:
          charge.scope === "line" && charge.purchaseOrderLineId
            ? draftToServer.get(charge.purchaseOrderLineId) ?? null
            : null,
      }))
      .filter(
        (charge) => charge.scope === "order" || charge.purchaseOrderLineId,
      );
  }

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

  function addLine(input: AddPurchaseOrderLineInput) {
    setLines((current) => [
      ...current,
      { ...input, id: crypto.randomUUID() },
    ]);
  }

  function saveLine(updated: PurchaseOrderDraftLine) {
    setLines((current) =>
      current.map((line) => (line.id === updated.id ? updated : line)),
    );
  }

  function removeLine(lineId: string) {
    setLines((current) => current.filter((line) => line.id !== lineId));
  }

  const editingLine = useMemo(
    () => lines.find((line) => line.id === editingLineId) ?? null,
    [editingLineId, lines],
  );

  const headerErrors = useMemo(() => {
    const errors: Partial<Record<keyof PurchaseOrderHeaderValues | "vendor", string>> = {};
    if (!header.vendor) errors.vendor = "Choose who you're ordering from";
    if (!header.currencyId) {
      errors.currencyId = currencies.length === 0 && !currenciesLoading ? "No currencies available" : "Choose a currency";
    }
    if (!header.orderDate) errors.orderDate = "Enter the order date";
    if (header.expectedDate && header.orderDate && header.expectedDate < header.orderDate) {
      errors.expectedDate = "Expected delivery can't be before the order date";
    }
    return errors;
  }, [currencies.length, currenciesLoading, header]);

  function validateHeader(): string | null {
    setTriedNext(true);
    return Object.values(headerErrors)[0] ?? null;
  }

  const detailsDone = Object.keys(headerErrors).length === 0;
  const linesDone = lines.length > 0;

  function goToStep(index: number) {
    if (index === 1) {
      goToProducts();
      return;
    }
    setSelectedTab(index);
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
      const orderScopedCharges =
        chargesPayload.additionalCharges?.filter(
          (charge) => charge.scope === "order",
        ) ?? [];

      const order = await createPurchaseOrder({
        vendorId: header.vendor!.id,
        currencyId: header.currencyId,
        orderDate: header.orderDate,
        expectedDate: header.expectedDate || undefined,
        vendorReference: header.vendorReference || undefined,
        internalReference: header.internalReference || undefined,
        notes: vendorNotes || undefined,
        freightAmount: chargesPayload.freightAmount,
        freightPercent: chargesPayload.freightPercent,
        discountAmount: chargesPayload.discountAmount,
        discountPercent: chargesPayload.discountPercent,
        otherChargesAmount: chargesPayload.otherChargesAmount,
        targetMarginPercent: chargesPayload.targetMarginPercent,
        additionalCharges: orderScopedCharges,
        lines: lines.map((line) => ({
          productId: line.productId,
          warehouseId: line.warehouseId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: 0,
          discountAmount: 0,
        })),
      });

      const additionalCharges = mapChargesToServerLines(
        lines,
        order.lines ?? [],
      );

      if (additionalCharges.length > 0) {
        await updatePurchaseOrder(order.id, {
          additionalCharges,
        });
      }

      showSuccess(`Purchase order ${order.number} created.`);
      savedRef.current = true;
      router.push(`/dashboard/purchasing/orders/${order.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create purchase order";
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
          onAction: () => (dirty ? setLeaveOpen(true) : router.push("/dashboard/purchasing/orders")),
        },
      ]}
      subtitle="Order stock from a vendor and receive into your warehouses."
      title="New Purchase Order"
      titleMetadata={<Badge>Draft</Badge>}
    >
      <BlockStack gap="500">
        <div className="purchase-order-form-shell">
          <BlockStack gap="400">
        <ol className="npo-stepper" aria-label="Purchase order steps">
          {STEPS.map((step, index) => {
            const done = index === 0 ? detailsDone : linesDone;
            const current = selectedTab === index;
            return (
              <li key={step.title}>
                <button
                  aria-current={current ? "step" : undefined}
                  className={cn("npo-step", current && "is-current", done && "is-done")}
                  type="button"
                  onClick={() => goToStep(index)}
                >
                  <span className="npo-step__num">{done && !current ? "✓" : index + 1}</span>
                  <span className="npo-step__text">
                    <strong>{step.title}</strong>
                    <small>
                      {index === 0
                        ? header.vendor
                          ? `${header.vendor.name}${currency ? ` · ${currency.code}` : ""}`
                          : step.hint
                        : lines.length > 0
                          ? `${lines.length} line${lines.length === 1 ? "" : "s"} · ${unitCount} unit${unitCount === 1 ? "" : "s"}`
                          : step.hint}
                    </small>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        {currenciesError ? (
          <Banner
            tone="warning"
            action={{ content: "Try again", onAction: () => void reloadCurrencies() }}
            secondaryAction={{ content: "Currency settings", url: "/dashboard/settings/currencies" }}
          >
            Couldn&apos;t load currencies ({currenciesError}). Try again, or check your currency settings.
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
                  errors={
                    triedNext
                      ? headerErrors
                      : {
                          currencyId: currencies.length === 0 && !currenciesLoading ? "No currencies available" : undefined,
                          expectedDate: headerErrors.expectedDate,
                        }
                  }
                  onChange={changeHeader}
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
                  discountPercentLabel={discountPercentLabel}
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
                <PurchaseOrderCatalogSection
                  currencyCode={currency?.code}
                  documentCurrencyId={header.currencyId}
                  warehouses={warehouses}
                  onAdd={addLine}
                />

                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">
                        Line items ({lines.length})
                      </Text>
                      <Text as="p" tone="subdued">
                        {lines.length === 0
                          ? "Configured lines appear here as summary cards."
                          : `${lines.length} line${lines.length === 1 ? "" : "s"} · ${unitCount} unit${unitCount === 1 ? "" : "s"} · ${warehouseCount} warehouse${warehouseCount === 1 ? "" : "s"}`}
                      </Text>
                    </BlockStack>
                    <PurchaseOrderDraftLinesList
                      currencyCode={currency?.code}
                      lines={pricedLines}
                      onEdit={setEditingLineId}
                      onRemove={removeLine}
                    />
                  </BlockStack>
                </Card>

                <PurchaseOrderVendorDiscountForm
                  currency={currency}
                  lineCount={lines.length}
                  onChange={setCharges}
                  values={charges}
                />

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
                  discountPercentLabel={discountPercentLabel}
                  {...totals}
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
        </div>
      </BlockStack>

      <Modal
        open={Boolean(pendingCurrencyId)}
        primaryAction={{
          content: "Change currency",
          onAction: () => {
            setHeader((current) => ({ ...current, currencyId: pendingCurrencyId ?? current.currencyId }));
            setPendingCurrencyId(null);
          },
        }}
        secondaryActions={[{ content: "Keep current currency", onAction: () => setPendingCurrencyId(null) }]}
        title="Change the order currency?"
        onClose={() => setPendingCurrencyId(null)}
      >
        <Modal.Section>
          <Text as="p">
            {`You already have ${lines.length} line${lines.length === 1 ? "" : "s"} priced in ${currency?.code ?? "the current currency"}. Their unit prices won't be converted, so check each price after switching to ${currencies.find((c) => c.id === pendingCurrencyId)?.code ?? "the new currency"}.`}
          </Text>
        </Modal.Section>
      </Modal>

      <Modal
        open={leaveOpen}
        primaryAction={{
          content: "Discard order",
          destructive: true,
          onAction: () => {
            savedRef.current = true;
            router.push("/dashboard/purchasing/orders");
          },
        }}
        secondaryActions={[{ content: "Keep editing", onAction: () => setLeaveOpen(false) }]}
        title="Discard this purchase order?"
        onClose={() => setLeaveOpen(false)}
      >
        <Modal.Section>
          <Text as="p">It hasn&apos;t been saved yet. Leaving now throws away the vendor, lines and charges you entered.</Text>
        </Modal.Section>
      </Modal>

      <EditPurchaseOrderLineModal
        currencyCode={currency?.code}
        line={editingLine}
        open={Boolean(editingLine)}
        warehouses={warehouses}
        onClose={() => setEditingLineId(null)}
        onSave={(line) => {
          saveLine(line);
          setEditingLineId(null);
        }}
      />
    </AppPage>
  );
}
