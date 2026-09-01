"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  Grid,
  IndexTable,
  InlineStack,
  Layout,
  Link,
  Modal,
  Text,
} from "@shopify/polaris";
import { Building2, Package, ScanBarcode, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { GoodsReceiptPrintModal } from "@/components/purchasing/goods-receipt-print-modal";
import {
  buildProductPricingPayload,
  buildReceiptPricingRows,
  ReceiptPricingPanel,
} from "@/components/purchasing/receipt-pricing-panel";
import {
  buildSerialSlots,
  formatReceiveQuantity,
  ReceiveSerialEntry,
  serialsAreValid,
} from "@/components/purchasing/receive-serial-entry";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getGoodsReceipt,
  revertGoodsReceipt,
  updateGoodsReceiptLine,
  validateGoodsReceipt,
  type GoodsReceipt,
  type GoodsReceiptLine,
} from "@/lib/purchase-orders-api";

function formatDisplayDate(value: string | null | undefined) {
  if (!value) return " ";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function receiptStateLabel(state: GoodsReceipt["state"]) {
  switch (state) {
    case "done":
      return "Validated";
    case "draft":
      return "Draft";
    case "cancelled":
      return "Cancelled";
    default:
      return state;
  }
}

function receiptStateVariant(state: GoodsReceipt["state"]) {
  if (state === "done") return "success" as const;
  if (state === "draft") return "warning" as const;
  if (state === "cancelled") return "destructive" as const;
  return "neutral" as const;
}

interface LineInput {
  quantity: string;
  serials: string[];
}

function parseQuantity(value: string, max: number) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.min(amount, max);
}

function lineIsReady(line: GoodsReceiptLine, input: LineInput | undefined) {
  if (!input) return false;
  const max = line.qtyRemaining ?? Number(line.poLineQuantity ?? line.quantity);
  const quantity = parseQuantity(input.quantity, max);
  if (quantity <= 0) return false;
  if (line.trackSerial) return serialsAreValid(quantity, input.serials);
  return true;
}

export function GoodsReceiptViewPage({ receiptId }: { receiptId: string }) {
  const router = useRouter();
  const [receipt, setReceipt] = useState<GoodsReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [lineInputs, setLineInputs] = useState<Record<string, LineInput>>({});
  const [sellingPrices, setSellingPrices] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    try {
      const detail = await getGoodsReceipt(receiptId);
      setReceipt(detail);
      setError(null);

      const inputs: Record<string, LineInput> = {};
      for (const line of detail.lines ?? []) {
        const max = line.qtyRemaining ?? Number(line.quantity);
        const quantity = parseQuantity(
          formatReceiveQuantity(line.quantity),
          max,
        );
        inputs[line.id] = {
          quantity: String(quantity || formatReceiveQuantity(line.quantity)),
          serials: buildSerialSlots(
            quantity || Number(line.quantity) || 1,
            line.serialNumbers ?? [],
          ),
        };
      }
      setLineInputs(inputs);

      const pricingRows = buildReceiptPricingRows(detail.lines ?? []);
      const prices: Record<string, string> = {};
      for (const row of pricingRows) {
        prices[row.productId] =
          detail.lines?.find((line) => line.productId === row.productId)
            ?.suggestedSellingPrice ??
          row.currentSellingPrice ??
          "";
      }
      setSellingPrices(prices);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load receipt");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [receiptId]);

  const isDraft = receipt?.state === "draft";
  const lines = receipt?.lines ?? [];
  const totalUnits = lines.reduce((sum, line) => sum + Number(line.quantity), 0);
  const serialCount = lines.reduce(
    (sum, line) => sum + (line.serialNumbers?.length ?? 0),
    0,
  );

  const readyCount = useMemo(
    () => lines.filter((line) => lineIsReady(line, lineInputs[line.id])).length,
    [lineInputs, lines],
  );

  const allLinesReady =
    lines.length > 0 && readyCount === lines.length && isDraft;

  async function handleValidate() {
    if (!receipt || !isDraft) return;

    setSaving(true);
    setError(null);

    try {
      for (const line of lines) {
        const input = lineInputs[line.id];
        if (!input) continue;

        const max = line.qtyRemaining ?? Number(line.quantity);
        const quantity = parseQuantity(input.quantity, max);
        const serialNumbers = line.trackSerial
          ? input.serials
              .slice(0, quantity)
              .map((value) => value.trim())
              .filter(Boolean)
          : undefined;

        await updateGoodsReceiptLine(receipt.id, line.id, {
          quantity,
          serialNumbers,
        });
      }

      const productPricing = buildProductPricingPayload(
        buildReceiptPricingRows(lines),
        sellingPrices,
      );

      const updated = await validateGoodsReceipt(receipt.id, { productPricing });
      setReceipt(updated);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to validate receipt",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRevert() {
    if (!receipt || receipt.state !== "done") return;

    setReverting(true);
    setError(null);

    try {
      const reverted = await revertGoodsReceipt(receipt.id);
      setReceipt(reverted);
      setRevertOpen(false);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to revert receipt",
      );
    } finally {
      setReverting(false);
    }
  }

  function updateLineSerials(lineId: string, serials: string[]) {
    setLineInputs((current) => ({
      ...current,
      [lineId]: {
        quantity: current[lineId]?.quantity ?? "1",
        serials,
      },
    }));
  }

  if (loading && !receipt) {
    return (
      <AppPage
        backAction={{ url: "/dashboard/purchasing/receipts" }}
        title="Goods receipt"
      >
        <Text as="p" tone="subdued">
          Loading goods receipt…
        </Text>
      </AppPage>
    );
  }

  if (error && !receipt) {
    return (
      <AppPage
        backAction={{ url: "/dashboard/purchasing/receipts" }}
        title="Goods receipt"
      >
        <Banner tone="critical">{error}</Banner>
      </AppPage>
    );
  }

  if (!receipt) {
    return (
      <AppPage
        backAction={{ url: "/dashboard/purchasing/receipts" }}
        title="Goods receipt"
      >
        <Banner tone="critical">Goods receipt not found</Banner>
      </AppPage>
    );
  }

  return (
    <AppPage
      backAction={{
        content: "Receipts",
        url: "/dashboard/purchasing/receipts",
      }}
      primaryAction={
        isDraft
          ? {
              content: "Validate receipt & update stock",
              loading: saving,
              disabled: !allLinesReady,
              onAction: () => void handleValidate(),
            }
          : undefined
      }
      secondaryActions={[
        ...(receipt.state === "done"
          ? [
              {
                content: "Print receipt",
                onAction: () => setPrintOpen(true),
              },
              {
                content: "Revert to Draft",
                destructive: true,
                onAction: () => setRevertOpen(true),
              },
            ]
          : []),
        {
          content: "View purchase order",
          onAction: () =>
            router.push(
              `/dashboard/purchasing/orders/${receipt.purchaseOrderId}`,
            ),
        },
      ]}
      subtitle={`${receipt.vendorName ?? "Vendor"} · PO ${receipt.purchaseOrderNumber ?? " "}`}
      title={receipt.number}
    >
      <BlockStack gap="500">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        {isDraft ? (
          <Banner tone="warning">
            This receipt is still a <strong>draft</strong>. Enter quantities and
            serial numbers (only for serialized products), then validate to add
            stock.
          </Banner>
        ) : receipt.state === "done" ? (
          <Banner tone="success">
            Receipt validated on{" "}
            {receipt.validatedAt
              ? new Date(receipt.validatedAt).toLocaleString()
              : formatDisplayDate(receipt.receiptDate)}
            . Stock has been updated.
          </Banner>
        ) : null}

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="start" wrap>
                    <InlineStack gap="300" blockAlign="center">
                      <Box
                        background="bg-surface-secondary"
                        borderRadius="full"
                        padding="300"
                      >
                        <Truck aria-hidden size={24} strokeWidth={1.75} />
                      </Box>
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center" wrap>
                          <Text as="h2" variant="headingLg">
                            {receipt.number}
                          </Text>
                          <StatusBadge variant={receiptStateVariant(receipt.state)}>
                            {receiptStateLabel(receipt.state)}
                          </StatusBadge>
                        </InlineStack>
                        <Text as="p" tone="subdued">
                          {receipt.vendorName} · Created{" "}
                          {formatDisplayDate(receipt.createdAt)}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                    <Button
                      onClick={() =>
                        router.push(
                          `/dashboard/purchasing/orders/${receipt.purchaseOrderId}`,
                        )
                      }
                    >
                      View PO
                    </Button>
                  </InlineStack>

                  <Divider />

                  <Grid>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                      <BlockStack gap="100">
                        <Text as="span" tone="subdued" variant="bodySm">
                          Receipt date
                        </Text>
                        <Text as="span" fontWeight="semibold">
                          {formatDisplayDate(receipt.receiptDate)}
                        </Text>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                      <BlockStack gap="100">
                        <Text as="span" tone="subdued" variant="bodySm">
                          Purchase order
                        </Text>
                        <Link
                          url={`/dashboard/purchasing/orders/${receipt.purchaseOrderId}`}
                        >
                          {receipt.purchaseOrderNumber ?? "View PO"}
                        </Link>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                      <BlockStack gap="100">
                        <Text as="span" tone="subdued" variant="bodySm">
                          Vendor
                        </Text>
                        <InlineStack gap="150" blockAlign="center">
                          <Building2 aria-hidden size={14} />
                          <Text as="span" fontWeight="semibold">
                            {receipt.vendorName ?? " "}
                          </Text>
                        </InlineStack>
                      </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                      <BlockStack gap="100">
                        <Text as="span" tone="subdued" variant="bodySm">
                          Validated
                        </Text>
                        <Text as="span" fontWeight="semibold">
                          {receipt.validatedAt
                            ? new Date(receipt.validatedAt).toLocaleString()
                            : " "}
                        </Text>
                      </BlockStack>
                    </Grid.Cell>
                  </Grid>

                  {receipt.notes ? (
                    <>
                      <Divider />
                      <BlockStack gap="100">
                        <Text as="span" tone="subdued" variant="bodySm">
                          Notes
                        </Text>
                        <Text as="p">{receipt.notes}</Text>
                      </BlockStack>
                    </>
                  ) : null}
                </BlockStack>
              </Card>

              {isDraft ? (
                <BlockStack gap="400">
                  {lines.map((line) => {
                    const input = lineInputs[line.id];
                    const quantity = parseQuantity(
                      input?.quantity ?? "0",
                      line.qtyRemaining ?? Number(line.quantity),
                    );
                    const ready = lineIsReady(line, input);

                    return (
                      <Card key={line.id}>
                        <BlockStack gap="400">
                          <InlineStack gap="200" blockAlign="center" wrap>
                            <Box
                              background="bg-surface-secondary"
                              borderRadius="full"
                              padding="200"
                            >
                              {line.trackSerial ? (
                                <ScanBarcode
                                  aria-hidden
                                  size={18}
                                  strokeWidth={1.75}
                                />
                              ) : (
                                <Package aria-hidden size={18} strokeWidth={1.75} />
                              )}
                            </Box>
                            <BlockStack gap="050">
                              <InlineStack gap="200" blockAlign="center" wrap>
                                <Text as="h3" variant="headingSm">
                                  {line.productName}
                                </Text>
                                {line.productSku ? (
                                  <Badge>{line.productSku}</Badge>
                                ) : null}
                                {line.trackSerial ? (
                                  <Badge tone="info">Serialized</Badge>
                                ) : null}
                                {ready ? <Badge tone="success">Ready</Badge> : null}
                              </InlineStack>
                              <Text as="p" tone="subdued" variant="bodySm">
                                Into {line.warehouseName ?? "warehouse"} · qty{" "}
                                {formatReceiveQuantity(line.quantity)}
                              </Text>
                            </BlockStack>
                          </InlineStack>

                          {line.trackSerial ? (
                            <ReceiveSerialEntry
                              productId={line.productId}
                              quantity={quantity}
                              serials={input?.serials ?? []}
                              onChange={(serials) =>
                                updateLineSerials(line.id, serials)
                              }
                            />
                          ) : (
                            <Banner tone="success">
                              Quantity product  {" "}
                              {formatReceiveQuantity(line.quantity)} unit(s)
                              will be added to stock on validate. No serial
                              numbers needed.
                            </Banner>
                          )}
                        </BlockStack>
                      </Card>
                    );
                  })}
                </BlockStack>
              ) : null}

              {isDraft ? (
                <ReceiptPricingPanel
                  currencyCode={receipt.currencyCode ?? "USD"}
                  lines={lines}
                  sellingPrices={sellingPrices}
                  onSellingPriceChange={(productId, value) =>
                    setSellingPrices((current) => ({
                      ...current,
                      [productId]: value,
                    }))
                  }
                />
              ) : null}

              {!isDraft ? (
                <Card padding="0">
                  <BlockStack gap="400">
                    <Box padding="400" paddingBlockEnd="0">
                      <BlockStack gap="100">
                        <Text as="h2" variant="headingMd">
                          Received products
                        </Text>
                        <Text as="p" tone="subdued">
                          {lines.length} line{lines.length === 1 ? "" : "s"} ·{" "}
                          {formatReceiveQuantity(totalUnits)} unit
                          {totalUnits === 1 ? "" : "s"}
                        </Text>
                      </BlockStack>
                    </Box>

                    <IndexTable
                      headings={[
                        { title: "Product" },
                        { title: "Warehouse" },
                        { title: "Qty", alignment: "end" },
                        { title: "Serial numbers" },
                      ]}
                      itemCount={lines.length}
                      selectable={false}
                    >
                      {lines.map((line, index) => (
                        <IndexTable.Row
                          id={line.id}
                          key={line.id}
                          position={index}
                        >
                          <IndexTable.Cell>
                            <BlockStack gap="050">
                              <Text as="span" fontWeight="semibold">
                                {line.productName ?? line.productId}
                              </Text>
                              {line.productSku ? (
                                <Text as="span" tone="subdued" variant="bodySm">
                                  {line.productSku}
                                </Text>
                              ) : null}
                            </BlockStack>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="span" tone="subdued">
                              {line.warehouseName ?? " "}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="span" alignment="end" numeric>
                              {formatReceiveQuantity(line.quantity)}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            {line.trackSerial ? (
                              (line.serialNumbers ?? []).length > 0 ? (
                                <InlineStack gap="150" wrap>
                                  {(line.serialNumbers ?? []).map((serial) => (
                                    <Badge key={serial} tone="info">
                                      {serial}
                                    </Badge>
                                  ))}
                                </InlineStack>
                              ) : (
                                <Text as="span" tone="subdued">
                                  {" "}
                                </Text>
                              )
                            ) : (
                              <Text as="span" tone="subdued">
                                Bulk
                              </Text>
                            )}
                          </IndexTable.Cell>
                        </IndexTable.Row>
                      ))}
                    </IndexTable>
                  </BlockStack>
                </Card>
              ) : null}
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Receipt summary
                  </Text>
                  <div className="quotation-summary-panel__rows">
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Status
                      </Text>
                      <StatusBadge variant={receiptStateVariant(receipt.state)}>
                        {receiptStateLabel(receipt.state)}
                      </StatusBadge>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Line items
                      </Text>
                      <Text as="span">{lines.length}</Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Units
                      </Text>
                      <Text as="span">
                        {formatReceiveQuantity(totalUnits)}
                      </Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Serials tracked
                      </Text>
                      <Text as="span">{serialCount}</Text>
                    </div>
                  </div>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    What&apos;s next?
                  </Text>
                  {isDraft ? (
                    <BlockStack gap="200">
                      <Text as="p" tone="subdued" variant="bodySm">
                        {readyCount} of {lines.length} line
                        {lines.length === 1 ? "" : "s"} ready.
                      </Text>
                      <Text as="p" variant="bodySm">
                        Quantity products only need a receive amount. Serialized
                        products need one serial per unit, then click{" "}
                        <strong>Validate receipt & update stock</strong>.
                      </Text>
                      <Button
                        disabled={!allLinesReady}
                        fullWidth
                        loading={saving}
                        variant="primary"
                        onClick={() => void handleValidate()}
                      >
                        Validate receipt & update stock
                      </Button>
                    </BlockStack>
                  ) : (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm">
                        Stock is in your warehouse. Check{" "}
                        <Link url="/dashboard/inventory">Inventory</Link> for
                        quantities and serial numbers.
                      </Text>
                      <Button fullWidth onClick={() => setPrintOpen(true)}>
                        Print receipt
                      </Button>
                      <Button
                        fullWidth
                        tone="critical"
                        variant="plain"
                        onClick={() => setRevertOpen(true)}
                      >
                        Revert to Draft
                      </Button>
                      <Button
                        fullWidth
                        onClick={() =>
                          router.push(
                            `/dashboard/purchasing/orders/${receipt.purchaseOrderId}`,
                          )
                        }
                      >
                        Back to purchase order
                      </Button>
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>

      {receipt.state === "done" ? (
        <GoodsReceiptPrintModal
          open={printOpen}
          receipt={receipt}
          onClose={() => setPrintOpen(false)}
        />
      ) : null}

      <Modal
        open={revertOpen}
        onClose={() => setRevertOpen(false)}
        title={`Revert ${receipt.number} to Draft?`}
        primaryAction={{
          content: "Revert to Draft",
          destructive: true,
          loading: reverting,
          onAction: () => void handleRevert(),
        }}
        secondaryActions={[
          {
            content: "Cancel",
            disabled: reverting,
            onAction: () => setRevertOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="warning">
              This action will reset the goods receipt back to <strong>Draft</strong>, safely remove newly created duplicate in-stock units from your warehouse, and reset the purchase order received quantities.
            </Banner>
            <Text as="p">
              After reverting, you can edit quantities, select/link the serial numbers of products that were already sold on customer invoices, and re-validate.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
