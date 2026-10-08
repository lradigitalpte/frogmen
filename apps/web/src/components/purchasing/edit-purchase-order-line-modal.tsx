"use client";

import {
  BlockStack,
  FormLayout,
  Modal,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/components/sales/format-money";
import type { PurchaseOrderDraftLine } from "@/components/purchasing/purchase-order-draft-lines-table";
import type { Warehouse } from "@/types/warehouse";

interface EditPurchaseOrderLineModalProps {
  open: boolean;
  line: PurchaseOrderDraftLine | null;
  warehouses: Warehouse[];
  currencyCode?: string;
  onClose: () => void;
  onSave: (line: PurchaseOrderDraftLine) => void;
}

export function EditPurchaseOrderLineModal({
  open,
  line,
  warehouses,
  currencyCode,
  onClose,
  onSave,
}: EditPurchaseOrderLineModalProps) {
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("0");

  useEffect(() => {
    if (open && line) {
      setWarehouseId(line.warehouseId);
      setQuantity(String(line.quantity));
      setUnitPrice(String(line.unitPrice));
    }
  }, [line, open]);

  const warehouse = useMemo(
    () => warehouses.find((item) => item.id === warehouseId),
    [warehouseId, warehouses],
  );

  const lineTotal =
    Math.round((Number(quantity) || 0) * (Number(unitPrice) || 0) * 100) / 100;

  function handleSave() {
    if (!line || !warehouse) return;
    const qty = Number(quantity);
    const price = Number(unitPrice);
    if (!qty || qty <= 0 || Number.isNaN(price)) return;

    onSave({
      ...line,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      quantity: qty,
      unitPrice: price,
    });
    onClose();
  }

  const saveDisabled =
    !line || !warehouse || !quantity || Number(quantity) <= 0;

  return (
    <Modal
      open={open}
      primaryAction={{
        content: "Save line",
        onAction: handleSave,
        disabled: saveDisabled,
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
      title={line ? `Edit ${line.productName}` : "Edit line"}
      onClose={onClose}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <FormLayout>
            <Select
              label="Receive into warehouse"
              options={warehouses.map((item) => ({
                label: item.code ? `${item.name} (${item.code})` : item.name,
                value: item.id,
              }))}
              value={warehouseId}
              onChange={setWarehouseId}
            />
            <FormLayout.Group>
              <TextField
                autoComplete="off"
                label="Quantity"
                type="number"
                value={quantity}
                onChange={setQuantity}
              />
              <TextField
                autoComplete="off"
                label="Unit cost"
                type="number"
                value={unitPrice}
                onChange={setUnitPrice}
              />
            </FormLayout.Group>
          </FormLayout>
          <div className="quotation-summary-panel__total">
            <Text as="span" tone="subdued">
              Line total (before order discount)
            </Text>
            <Text as="span" fontWeight="bold" variant="headingMd">
              {formatMoney(String(lineTotal), currencyCode)}
            </Text>
          </div>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
