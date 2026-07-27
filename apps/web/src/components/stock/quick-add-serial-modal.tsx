"use client";

import {
  BlockStack,
  Modal,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useEffect, useState } from "react";
import { createProductUnit } from "@/lib/products-api";
import type { Warehouse } from "@/types/warehouse";

interface QuickAddSerialModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  productId: string;
  productName: string;
  warehouseId?: string;
  warehouses: Warehouse[];
}

export function QuickAddSerialModal({
  open,
  onClose,
  onSuccess,
  productId,
  productName,
  warehouseId: initialWarehouseId,
  warehouses,
}: QuickAddSerialModalProps) {
  const [serialNumber, setSerialNumber] = useState("");
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSerialNumber("");
    setWarehouseId(initialWarehouseId ?? warehouses[0]?.id ?? "");
    setError(null);
  }, [open, initialWarehouseId, warehouses]);

  async function handleSave() {
    if (!serialNumber.trim()) {
      setError("Serial number is required.");
      return;
    }
    if (!warehouseId) {
      setError("Select a warehouse.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await createProductUnit(productId, {
        serialNumber: serialNumber.trim(),
        warehouseId,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add serial");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`Add serial   ${productName}`}
      onClose={onClose}
      primaryAction={{
        content: "Add unit",
        loading: saving,
        onAction: () => void handleSave(),
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Text as="p" tone="subdued">
            Registers one physical unit. Each serial is tracked individually.
          </Text>
          <TextField
            autoComplete="off"
            label="Serial number"
            value={serialNumber}
            onChange={setSerialNumber}
            placeholder="e.g. ROV-001"
          />
          <Select
            label="Warehouse"
            options={warehouses.map((warehouse) => ({
              label: `${warehouse.code}   ${warehouse.name}`,
              value: warehouse.id,
            }))}
            value={warehouseId}
            onChange={setWarehouseId}
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
