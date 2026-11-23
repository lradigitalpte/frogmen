"use client";

import { formatAppDate } from "@/lib/format-date";
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

  const editing = warranty.status !== "pending_delivery";
  const soldOn = warranty.soldAt?.slice(0, 10) ?? "";
  const months = warranty.policy?.durationMonths ?? 0;
  const dateValid = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(deliveryDate.trim());
  const beforeSale = dateValid && soldOn && deliveryDate.trim() < soldOn;
  const endsPreview = (() => {
    if (!dateValid || !months) return null;
    const [y, m, d] = deliveryDate.trim().split("-").map(Number);
    const end = new Date(Date.UTC(y, m - 1, d));
    end.setUTCMonth(end.getUTCMonth() + months);
    return end.toISOString().slice(0, 10);
  })();

  async function handleConfirm() {
    if (!warranty) return;
    if (!deliveryDate.trim()) {
      setError("Please select a valid delivery date");
      return;
    }
    if (deliveryDate.trim() < (warranty.soldAt?.slice(0, 10) ?? "")) {
      setError("Delivery date can't be before the sale date");
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
      title={editing ? "Change delivery date" : "Confirm delivery"}
      primaryAction={{
        content: editing ? "Save delivery date" : "Confirm and start warranty",
        disabled: Boolean(beforeSale),
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
                Serial number: {warranty.serialNumber}
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
            {editing
              ? "Coverage is recalculated from the new delivery date using the policy length."
              : "Coverage starts on the delivery date and runs for the policy length."}
          </Text>

          <FormLayout>
            <TextField
              autoComplete="off"
              error={beforeSale ? "Can't be before the sale date" : undefined}
              label="Delivery date"
              min={soldOn || undefined}
              type="date"
              value={deliveryDate}
              onChange={setDeliveryDate}
              helpText={
                endsPreview
                  ? `The day the customer received it. Coverage would end on ${formatAppDate(endsPreview)}.`
                  : "The day the customer received it."
              }
            />

            <TextField
              autoComplete="off"
              label="Delivery reference or notes"
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
