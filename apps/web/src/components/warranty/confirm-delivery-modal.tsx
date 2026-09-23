"use client";

import {
  Banner,
  BlockStack,
  FormLayout,
  Modal,
  Text,
  TextField,
} from "@shopify/polaris";
import { useEffect, useState } from "react";
import { todayIsoDate } from "@/components/sales/format-money";
import { confirmWarrantyDelivery, type WarrantyRegistration } from "@/lib/warranty-api";

interface ConfirmDeliveryModalProps {
  open: boolean;
  onClose: () => void;
  warranty: WarrantyRegistration | null;
  onSuccess: (updated: WarrantyRegistration) => void;
}

export function ConfirmDeliveryModal({
  open,
  onClose,
  warranty,
  onSuccess,
}: ConfirmDeliveryModalProps) {
  const [deliveryDate, setDeliveryDate] = useState(todayIsoDate());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDeliveryDate(warranty?.deliveredAt ?? todayIsoDate());
      setNotes("");
      setError(null);
    }
  }, [open, warranty]);

  if (!warranty) return null;

  async function handleConfirm() {
    if (!warranty) return;
    if (!deliveryDate.trim()) {
      setError("Please select a valid delivery date");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const updated = await confirmWarrantyDelivery(warranty.id, {
        deliveryDate: deliveryDate.trim(),
        notes: notes.trim() || undefined,
      });
      onSuccess(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm delivery");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirm Equipment Delivery"
      primaryAction={{
        content: "Confirm & Start Warranty",
        onAction: () => void handleConfirm(),
        loading: submitting,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: onClose,
          disabled: submitting,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {error ? <Banner tone="critical">{error}</Banner> : null}

          <BlockStack gap="100">
            <Text as="p" variant="bodyMd" fontWeight="semibold">
              {warranty.displayProductName}
            </Text>
            {warranty.serialNumber ? (
              <Text as="p" tone="subdued" variant="bodySm">
                Serial Number: {warranty.serialNumber}
              </Text>
            ) : null}
            <Text as="p" tone="subdued" variant="bodySm">
              Customer: {warranty.displayCustomerName}
            </Text>
            {warranty.policy?.name ? (
              <Text as="p" tone="subdued" variant="bodySm">
                Policy: {warranty.policy.name} ({warranty.policy.durationMonths} months)
              </Text>
            ) : null}
          </BlockStack>

          <Text as="p" tone="subdued">
            Confirming delivery will start the warranty clock on the selected delivery date
            and calculate the expiration date based on the warranty policy.
          </Text>

          <FormLayout>
            <TextField
              autoComplete="off"
              label="Delivery Date"
              type="date"
              value={deliveryDate}
              onChange={setDeliveryDate}
              helpText="The date the customer physically received the equipment."
            />

            <TextField
              autoComplete="off"
              label="Delivery Reference / Notes"
              value={notes}
              onChange={setNotes}
              placeholder="e.g. Courier tracking # or recipient signature"
              multiline={2}
            />
          </FormLayout>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
