"use client";

import {
  BlockStack,
  Modal,
  RadioButton,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useEffect, useState } from "react";
import { adjustStock } from "@/lib/products-api";
import type { Warehouse } from "@/types/warehouse";

type AdjustMode = "absolute" | "delta";

interface AdjustStockModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  productId: string;
  productName: string;
  warehouseId?: string;
  currentQuantity?: string;
  warehouses: Warehouse[];
}

export function AdjustStockModal({
  open,
  onClose,
  onSuccess,
  productId,
  productName,
  warehouseId: initialWarehouseId,
  currentQuantity = "0",
  warehouses,
}: AdjustStockModalProps) {
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId ?? "");
  const [mode, setMode] = useState<AdjustMode>("delta");
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setWarehouseId(initialWarehouseId ?? warehouses[0]?.id ?? "");
    setMode("delta");
    setQuantity("");
    setError(null);
  }, [open, initialWarehouseId, warehouses]);

  const current = Number(currentQuantity) || 0;

  async function handleSave() {
    if (!warehouseId) {
      setError("Select a warehouse.");
      return;
    }

    const parsed = Number(quantity);
    if (!quantity || Number.isNaN(parsed)) {
      setError("Enter a valid quantity.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (mode === "absolute") {
        await adjustStock({
          productId,
          warehouseId,
          quantity: String(parsed),
        });
      } else {
        await adjustStock({
          productId,
          warehouseId,
          adjustment: String(parsed),
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to adjust stock");
    } finally {
      setSaving(false);
    }
  }

  const projected =
    mode === "absolute"
      ? Number(quantity) || 0
      : current + (Number(quantity) || 0);

  return (
    <Modal
      open={open}
      title={`Adjust stock   ${productName}`}
      onClose={onClose}
      primaryAction={{
        content: "Save",
        loading: saving,
        onAction: () => void handleSave(),
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <Text as="p" tone="subdued">
            Current on hand: <strong>{current}</strong>
          </Text>

          <Select
            label="Warehouse"
            options={warehouses.map((warehouse) => ({
              label: `${warehouse.code}   ${warehouse.name}`,
              value: warehouse.id,
            }))}
            value={warehouseId}
            onChange={setWarehouseId}
          />

          <BlockStack gap="200">
            <Text as="p" variant="bodyMd" fontWeight="semibold">
              Adjustment type
            </Text>
            <RadioButton
              label="Add or remove units (+5 / −2)"
              checked={mode === "delta"}
              id="adjust-delta"
              name="adjust-mode"
              onChange={() => setMode("delta")}
            />
            <RadioButton
              label="Set exact quantity on hand"
              checked={mode === "absolute"}
              id="adjust-absolute"
              name="adjust-mode"
              onChange={() => setMode("absolute")}
            />
          </BlockStack>

          <TextField
            autoComplete="off"
            label={mode === "delta" ? "Change by (+/−)" : "New quantity on hand"}
            type="number"
            value={quantity}
            onChange={setQuantity}
            helpText={
              mode === "delta"
                ? `Use negative numbers to remove stock. New total: ${projected}`
                : `Sets quantity to exactly ${projected}`
            }
          />

          {error ? (
            <Text as="p" tone="critical">
              {error}
            </Text>
          ) : null}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
