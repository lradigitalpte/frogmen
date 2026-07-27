"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Card,
  Divider,
  FormLayout,
  InlineStack,
  Modal,
  Text,
  TextField,
} from "@shopify/polaris";
import { Package, ScanBarcode } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildSerialSlots,
  formatReceiveQuantity,
  ReceiveSerialEntry,
  serialsAreValid,
} from "@/components/purchasing/receive-serial-entry";
import {
  createGoodsReceipt,
  getGoodsReceipt,
  updateGoodsReceiptLine,
  validateGoodsReceipt,
  type GoodsReceipt,
  type GoodsReceiptLine,
} from "@/lib/purchase-orders-api";

interface ReceiveGoodsModalProps {
  open: boolean;
  orderId: string;
  onClose: () => void;
  onSuccess: () => void;
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

  const quantity = parseQuantity(input.quantity, line.qtyRemaining ?? 0);
  if (quantity <= 0) return false;

  if (line.trackSerial) {
    return serialsAreValid(quantity, input.serials);
  }

  return true;
}

export function ReceiveGoodsModal({
  open,
  orderId,
  onClose,
  onSuccess,
}: ReceiveGoodsModalProps) {
  const [receipt, setReceipt] = useState<GoodsReceipt | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lineInputs, setLineInputs] = useState<Record<string, LineInput>>({});

  useEffect(() => {
    if (!open) return;

    async function init() {
      setLoading(true);
      setError(null);
      setReceipt(null);
      setLineInputs({});

      try {
        const created = await createGoodsReceipt(orderId);
        const detail = await getGoodsReceipt(created.id);
        setReceipt(detail);

        const inputs: Record<string, LineInput> = {};
        for (const line of detail.lines ?? []) {
          const quantity = parseQuantity(
            formatReceiveQuantity(line.quantity),
            line.qtyRemaining ?? Number(line.quantity),
          );
          inputs[line.id] = {
            quantity: String(quantity || line.qtyRemaining || 1),
            serials: buildSerialSlots(
              quantity || Number(line.qtyRemaining) || 1,
              line.serialNumbers ?? [],
            ),
          };
        }
        setLineInputs(inputs);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create receipt",
        );
      } finally {
        setLoading(false);
      }
    }

    void init();
  }, [open, orderId]);

  const readyCount = useMemo(() => {
    return (receipt?.lines ?? []).filter((line) =>
      lineIsReady(line, lineInputs[line.id]),
    ).length;
  }, [lineInputs, receipt?.lines]);

  function updateLineQuantity(line: GoodsReceiptLine, value: string) {
    const max = line.qtyRemaining ?? Number(line.quantity);
    const quantity = parseQuantity(value, max);
    const nextQuantity = quantity > 0 ? String(quantity) : value;

    setLineInputs((current) => {
      const existing = current[line.id];
      const serialCount = line.trackSerial
        ? parseQuantity(nextQuantity, max)
        : 0;

      return {
        ...current,
        [line.id]: {
          quantity: nextQuantity,
          serials: line.trackSerial
            ? buildSerialSlots(serialCount, existing?.serials ?? [])
            : [],
        },
      };
    });
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

  async function handleValidate() {
    if (!receipt) return;

    const lines = receipt.lines ?? [];
    const validationErrors: string[] = [];

    for (const line of lines) {
      const input = lineInputs[line.id];
      if (!input) {
        validationErrors.push(`${line.productName}: missing receive details`);
        continue;
      }

      const quantity = parseQuantity(
        input.quantity,
        line.qtyRemaining ?? Number(line.quantity),
      );

      if (quantity <= 0) {
        validationErrors.push(`${line.productName}: quantity must be greater than zero`);
        continue;
      }

      if (line.trackSerial && !serialsAreValid(quantity, input.serials)) {
        validationErrors.push(
          `${line.productName}: enter ${quantity} unique serial number(s)`,
        );
      }
    }

    if (validationErrors.length > 0) {
      setError(validationErrors.join(" "));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      for (const line of lines) {
        const input = lineInputs[line.id];
        if (!input) continue;

        const quantity = parseQuantity(
          input.quantity,
          line.qtyRemaining ?? Number(line.quantity),
        );
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

      await validateGoodsReceipt(receipt.id);
      onSuccess();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to validate receipt",
      );
      setSaving(false);
    }
  }

  const allLinesReady =
    (receipt?.lines?.length ?? 0) > 0 &&
    readyCount === (receipt?.lines?.length ?? 0);

  return (
    <Modal
      open={open}
      size="large"
      title="Receive products"
      primaryAction={{
        content: "Validate receipt & update stock",
        onAction: () => void handleValidate(),
        loading: saving,
        disabled: loading || !receipt || !allLinesReady,
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
      onClose={onClose}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {error ? <Banner tone="critical">{error}</Banner> : null}

          {loading ? (
            <Text as="p" tone="subdued">
              Preparing goods receipt…
            </Text>
          ) : null}

          {receipt ? (
            <Banner tone="info">
              Receipt <strong>{receipt.number}</strong> · PO{" "}
              {receipt.purchaseOrderNumber} · {receipt.vendorName}
            </Banner>
          ) : null}

          {!loading && receipt ? (
            <Text as="p" tone="subdued">
              {readyCount} of {receipt.lines?.length ?? 0} line
              {(receipt.lines?.length ?? 0) === 1 ? "" : "s"} ready to validate.{" "}
              <strong>Quantity products</strong> only need a receive amount.{" "}
              <strong>Serialized products</strong> need one unique serial per
              unit.
            </Text>
          ) : null}

          {(receipt?.lines ?? []).map((line, index) => {
            const input = lineInputs[line.id];
            const maxQty = line.qtyRemaining ?? Number(line.quantity);
            const quantity = parseQuantity(input?.quantity ?? "0", maxQty);
            const ready = lineIsReady(line, input);

            return (
              <Card key={line.id}>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="start" wrap>
                    <InlineStack gap="300" blockAlign="start">
                      <Box
                        background="bg-surface-secondary"
                        borderRadius="full"
                        padding="300"
                      >
                        {line.trackSerial ? (
                          <ScanBarcode aria-hidden size={20} strokeWidth={1.75} />
                        ) : (
                          <Package aria-hidden size={20} strokeWidth={1.75} />
                        )}
                      </Box>
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center" wrap>
                          <Text as="h3" variant="headingSm">
                            {line.productName}
                          </Text>
                          {line.productSku ? (
                            <Badge>{line.productSku}</Badge>
                          ) : null}
                          {line.trackSerial ? (
                            <Badge tone="info">Serialized</Badge>
                          ) : (
                            <Badge tone="success">Quantity</Badge>
                          )}
                          {ready ? <Badge tone="success">Ready</Badge> : null}
                        </InlineStack>
                        <Text as="p" tone="subdued" variant="bodySm">
                          Receive into {line.warehouseName ?? "warehouse"} · up
                          to {formatReceiveQuantity(maxQty)} remaining on PO
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </InlineStack>

                  <FormLayout>
                    <TextField
                      autoComplete="off"
                      helpText={`Maximum ${formatReceiveQuantity(maxQty)} for this line`}
                      label="Quantity to receive"
                      max={maxQty}
                      min={1}
                      type="number"
                      value={input?.quantity ?? formatReceiveQuantity(line.quantity)}
                      onChange={(value) => updateLineQuantity(line, value)}
                    />
                  </FormLayout>

                  {line.trackSerial ? (
                    <>
                      <Divider />
                      <ReceiveSerialEntry
                        quantity={quantity}
                        serials={input?.serials ?? []}
                        onChange={(serials) => updateLineSerials(line.id, serials)}
                      />
                    </>
                  ) : (
                    <Banner tone="success">
                      Quantity product   enter how many you received. Stock
                      increases by {quantity || 0} in{" "}
                      {line.warehouseName ?? "warehouse"}. No serial numbers
                      needed.
                    </Banner>
                  )}

                  {index < (receipt?.lines?.length ?? 0) - 1 ? (
                    <Divider />
                  ) : null}
                </BlockStack>
              </Card>
            );
          })}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
