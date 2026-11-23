"use client";

import {
  Banner,
  BlockStack,
  Button,
  Checkbox,
  FormLayout,
  Icon,
  InlineStack,
  Modal,
  Text,
  TextField,
} from "@shopify/polaris";
import { CalendarIcon, HashtagIcon, LockIcon, NoteIcon } from "@shopify/polaris-icons";
import { useEffect, useMemo, useState } from "react";
import { formatAppDate } from "@/lib/format-date";
import { updateInvoiceDetails, type Invoice, type UpdateInvoiceDetailsInput } from "@/lib/invoices-api";
import { cn } from "@/lib/utils";

interface EditInvoiceDetailsModalProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
  onSuccess: (updated: Invoice) => void;
}

const QUICK_REASONS = [
  "Customer sent their PO number",
  "Payment terms agreed with customer",
  "Corrected a typo",
  "Updated terms on request",
];

function addDays(iso: string, days: number) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysBetween(fromIso: string, toIso: string) {
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00`).getTime();
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function EditInvoiceDetailsModal({ open, onClose, invoice, onSuccess }: EditInvoiceDetailsModalProps) {
  const [customerReference, setCustomerReference] = useState("");
  const [internalReference, setInternalReference] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [syncSalesOrder, setSyncSalesOrder] = useState(true);
  const [regenerateNumber, setRegenerateNumber] = useState(false);
  const [showNumber, setShowNumber] = useState(false);
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
      setRegenerateNumber(false);
      setShowNumber(false);
      setReason("");
      setReasonError(null);
      setErrorMessage(null);
    }
  }, [open, invoice]);

  const changes = useMemo(() => {
    const list: string[] = [];
    if (customerReference.trim() !== (invoice.customerReference ?? "")) list.push("customer PO");
    if (internalReference.trim() !== (invoice.internalReference ?? "")) list.push("internal reference");
    if ((dueDate || "") !== (invoice.dueDate ?? "")) list.push("due date");
    if (notes !== (invoice.notes ?? "")) list.push("terms & notes");
    if (regenerateNumber) list.push("invoice number");
    return list;
  }, [customerReference, internalReference, dueDate, notes, regenerateNumber, invoice]);

  const termDays = dueDate && invoice.invoiceDate ? daysBetween(invoice.invoiceDate, dueDate) : null;

  async function handleSave() {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setReasonError("Add a short reason — it's kept in the invoice history.");
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
        regenerateNumber,
        reason: trimmedReason,
      };
      const updated = await updateInvoiceDetails(invoice.id, payload);
      onSuccess(updated);
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to update invoice details");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      primaryAction={{
        content: "Save changes",
        loading: submitting,
        disabled: submitting || changes.length === 0,
        onAction: () => void handleSave(),
      }}
      secondaryActions={[{ content: "Cancel", disabled: submitting, onAction: onClose }]}
      title={`Edit ${invoice.number}`}
      onClose={submitting ? () => undefined : onClose}
    >
      <Modal.Section>
        <BlockStack gap="500">
          {errorMessage ? (
            <Banner tone="critical" onDismiss={() => setErrorMessage(null)}>
              {errorMessage}
            </Banner>
          ) : null}

          <div className="ied-lock">
            <Icon source={LockIcon} tone="subdued" />
            <span>Amounts, lines and tax are locked. You can change references, the due date and notes — every edit is logged.</span>
          </div>

          {/* References */}
          <section className="ied-section">
            <header>
              <span className="ied-section__icon">
                <Icon source={HashtagIcon} />
              </span>
              <h3>References</h3>
            </header>
            <FormLayout>
              <FormLayout.Group>
                <TextField
                  autoComplete="off"
                  helpText="Printed on the invoice PDF."
                  label="Customer PO"
                  placeholder="e.g. PO-2026-9810"
                  value={customerReference}
                  onChange={setCustomerReference}
                />
                <TextField
                  autoComplete="off"
                  helpText="Only your team sees this."
                  label="Internal reference"
                  placeholder="e.g. Job 4471"
                  value={internalReference}
                  onChange={setInternalReference}
                />
              </FormLayout.Group>
              {invoice.salesOrderId && customerReference.trim() !== (invoice.customerReference ?? "") ? (
                <Checkbox
                  checked={syncSalesOrder}
                  label="Also update the PO on the linked sales order"
                  onChange={setSyncSalesOrder}
                />
              ) : null}
            </FormLayout>
          </section>

          {/* Payment due */}
          <section className="ied-section">
            <header>
              <span className="ied-section__icon">
                <Icon source={CalendarIcon} />
              </span>
              <h3>Payment due</h3>
              {termDays !== null ? (
                <span className="ied-section__aside">
                  {termDays === 0 ? "due on receipt" : `${termDays} days after the invoice date`}
                </span>
              ) : null}
            </header>
            <div className="ied-due">
              <div className="ied-due__field">
                <TextField
                  autoComplete="off"
                  label="Due date"
                  labelHidden
                  type="date"
                  value={dueDate}
                  onChange={setDueDate}
                />
              </div>
              <InlineStack gap="150">
                {[0, 7, 14, 30, 60].map((days) => {
                  const value = addDays(invoice.invoiceDate, days);
                  return (
                    <Button key={days} pressed={dueDate === value} size="slim" onClick={() => setDueDate(value)}>
                      {days === 0 ? "On receipt" : `${days} days`}
                    </Button>
                  );
                })}
              </InlineStack>
            </div>
            <Text as="p" tone="subdued" variant="bodySm">
              Invoice date {formatAppDate(invoice.invoiceDate)}
              {dueDate ? ` · due ${formatAppDate(dueDate)}` : ""}
            </Text>
          </section>

          {/* Notes */}
          <section className="ied-section">
            <header>
              <span className="ied-section__icon">
                <Icon source={NoteIcon} />
              </span>
              <h3>Terms &amp; notes</h3>
              <span className="ied-section__aside">shown to the customer</span>
            </header>
            <TextField
              autoComplete="off"
              label="Terms and notes"
              labelHidden
              multiline={4}
              placeholder="Payment instructions, warranty, delivery terms…"
              value={notes}
              onChange={setNotes}
            />
          </section>

          {/* Invoice number (rare) */}
          <div className={cn("ied-number", showNumber && "is-open")}>
            <button className="ied-number__toggle" type="button" onClick={() => setShowNumber((v) => !v)}>
              <span>
                Invoice number <strong>{invoice.number}</strong>
              </span>
              <small>{showNumber ? "Hide" : "Change"}</small>
            </button>
            {showNumber ? (
              <Checkbox
                checked={regenerateNumber}
                helpText="Gives this invoice the next number in your sequence. The old number stays in the history. Only do this if the number was issued by mistake."
                label="Assign a new invoice number"
                onChange={setRegenerateNumber}
              />
            ) : null}
          </div>

          {/* Reason */}
          <section className="ied-reason">
            <div className="ied-reason__head">
              <Text as="h3" variant="headingSm">
                Why are you changing this?
              </Text>
              {changes.length ? (
                <span className="ied-reason__changes">Changing: {changes.join(", ")}</span>
              ) : (
                <span className="ied-reason__changes is-none">No changes yet</span>
              )}
            </div>
            <div className="ied-reason__chips">
              {QUICK_REASONS.map((r) => (
                <Button key={r} pressed={reason === r} size="micro" onClick={() => { setReason(r); setReasonError(null); }}>
                  {r}
                </Button>
              ))}
            </div>
            <TextField
              autoComplete="off"
              error={reasonError || undefined}
              label="Reason"
              labelHidden
              multiline={2}
              placeholder="A short note for the invoice history"
              value={reason}
              onChange={(val) => {
                setReason(val);
                if (reasonError && val.trim()) setReasonError(null);
              }}
            />
          </section>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
