"use client";

import {
  Banner,
  BlockStack,
  Checkbox,
  FormLayout,
  Modal,
  Text,
  TextField,
} from "@shopify/polaris";
import { useEffect, useState } from "react";
import {
  updateInvoiceDetails,
  type Invoice,
  type UpdateInvoiceDetailsInput,
} from "@/lib/invoices-api";

interface EditInvoiceDetailsModalProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
  onSuccess: (updated: Invoice) => void;
}

export function EditInvoiceDetailsModal({
  open,
  onClose,
  invoice,
  onSuccess,
}: EditInvoiceDetailsModalProps) {
  const [customerReference, setCustomerReference] = useState("");
  const [internalReference, setInternalReference] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [syncSalesOrder, setSyncSalesOrder] = useState(true);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open && invoice) {
      setCustomerReference(invoice.customerReference ?? "");
      setInternalReference(invoice.internalReference ?? "");
      setDueDate(invoice.dueDate ?? "");
      setNotes(invoice.notes ?? "");
      setSyncSalesOrder(Boolean(invoice.salesOrderId));
      setReason("");
      setReasonError(null);
      setErrorMessage(null);
    }
  }, [open, invoice]);

  async function handleSave() {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setReasonError("A reason is required to maintain the audit trail for this document.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setReasonError(null);

    try {
      const payload: UpdateInvoiceDetailsInput = {
        customerReference: customerReference.trim() || undefined,
        internalReference: internalReference.trim() || undefined,
        dueDate: dueDate.trim() || undefined,
        notes: notes || undefined,
        syncSalesOrder: invoice.salesOrderId ? syncSalesOrder : false,
        reason: trimmedReason,
      };

      const updated = await updateInvoiceDetails(invoice.id, payload);
      onSuccess(updated);
      onClose();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to update invoice details",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title={`Edit Invoice Details — ${invoice.number}`}
      primaryAction={{
        content: "Save Changes",
        loading: submitting,
        disabled: submitting,
        onAction: () => void handleSave(),
      }}
      secondaryActions={[
        {
          content: "Cancel",
          disabled: submitting,
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {errorMessage ? <Banner tone="critical">{errorMessage}</Banner> : null}

          <Banner tone="info">
            <Text as="p">
              Financial lines, taxes, and accounting ledger items are protected and locked.
              You may update administrative metadata and references. An audit entry will be recorded.
            </Text>
          </Banner>

          <FormLayout>
            <TextField
              label="Customer PO / Reference"
              value={customerReference}
              onChange={setCustomerReference}
              placeholder="e.g. PO-2026-9810 or Contract Ref"
              autoComplete="off"
              helpText="Printed on commercial documents and the customer invoice PDF."
            />

            {invoice.salesOrderId ? (
              <Checkbox
                label="Update Customer PO reference on linked Sales Order as well"
                checked={syncSalesOrder}
                onChange={setSyncSalesOrder}
              />
            ) : null}

            <FormLayout.Group>
              <TextField
                label="Internal Reference"
                value={internalReference}
                onChange={setInternalReference}
                placeholder="e.g. Internal tracking code"
                autoComplete="off"
              />

              <TextField
                label="Payment Due Date"
                type="date"
                value={dueDate}
                onChange={setDueDate}
                autoComplete="off"
              />
            </FormLayout.Group>

            <TextField
              label="Terms & Conditions / Customer Notes"
              value={notes}
              onChange={setNotes}
              multiline={3}
              placeholder="Payment instructions, bank wire notes, warranty remarks..."
              autoComplete="off"
            />

            <TextField
              label="Reason for Edit"
              value={reason}
              onChange={(val) => {
                setReason(val);
                if (reasonError && val.trim()) setReasonError(null);
              }}
              error={reasonError || undefined}
              multiline={2}
              requiredIndicator
              placeholder="e.g. Customer provided PO number after signing for payment approval"
              autoComplete="off"
              helpText="Mandatory. This explanation is permanently logged in the invoice activity history."
            />
          </FormLayout>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
