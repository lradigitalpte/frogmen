"use client";

import { BlockStack, Modal, Text, TextField } from "@shopify/polaris";
import { useEffect, useState } from "react";

export function DeleteProductModal({
  productName,
  open,
  loading,
  error,
  onClose,
  onConfirm,
}: {
  productName: string;
  open: boolean;
  loading: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [confirmName, setConfirmName] = useState("");

  useEffect(() => {
    if (open) {
      setConfirmName("");
    }
  }, [open, productName]);

  const canDelete =
    confirmName.trim() === productName.trim() && productName.trim().length > 0;

  return (
    <Modal
      open={open}
      title={`Delete ${productName} forever?`}
      onClose={onClose}
      primaryAction={{
        content: "Delete forever",
        destructive: true,
        loading,
        disabled: !canDelete || loading,
        onAction: onConfirm,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          disabled: loading,
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Text as="p">
            This permanently removes the product, its stock, and its serial
            numbers. This cannot be undone.
          </Text>
          <Text as="p" tone="subdued">
            Old quotations and invoices keep their line text. If this product
            was used on those documents, delete will be blocked and it should
            stay archived.
          </Text>
          {error ? (
            <Text as="p" tone="critical">
              {error}
            </Text>
          ) : null}
          <TextField
            autoComplete="off"
            label={`Type ${productName} to confirm`}
            value={confirmName}
            onChange={setConfirmName}
            disabled={loading}
          />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
