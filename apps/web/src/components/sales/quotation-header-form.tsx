"use client";

import { BlockStack, Button, FormLayout, InlineStack, Layout, Modal, Text, TextField } from "@shopify/polaris";
import { useState } from "react";
import type { Customer } from "@/types/customer";
import type { Currency } from "@/lib/currencies-api";
import { CustomerPicker } from "./customer-picker";
import { CurrencyPicker } from "./currency-picker";
import { QuotationFormSection } from "./quotation-form-section";
import { ValidityPeriodPicker } from "./validity-period-picker";
import { DocumentNotesField } from "@/components/documents/document-notes-field";
import {
  computeValidityDate,
  type ValidityPreset,
} from "./validity-period";

export interface QuotationHeaderValues {
  customer: Customer | null;
  currencyId: string;
  quoteDate: string;
  validityPreset: ValidityPreset;
  validityDate: string;
  customerReference: string;
  internalReference: string;
  paymentReference: string;
  notes: string;
  internalNotes: string;
}

interface QuotationHeaderFormProps {
  values: QuotationHeaderValues;
  currencies: Currency[];
  currenciesLoading?: boolean;
  currenciesError?: string | null;
  onChange: (values: QuotationHeaderValues) => void;
  disabled?: boolean;
  errors?: Partial<Record<keyof QuotationHeaderValues | "customer", string>>;
}

export function QuotationHeaderForm({
  values,
  currencies,
  currenciesLoading,
  currenciesError,
  onChange,
  disabled,
  errors,
}: QuotationHeaderFormProps) {
  const [internalNotesOpen, setInternalNotesOpen] = useState(false);
  const [tempInternalNotes, setTempInternalNotes] = useState(values.internalNotes || "");

  function patch(partial: Partial<QuotationHeaderValues>) {
    const next = { ...values, ...partial };

    if (
      partial.quoteDate !== undefined &&
      next.validityPreset !== "custom"
    ) {
      next.validityDate = computeValidityDate(
        next.quoteDate,
        next.validityPreset,
      );
    }

    onChange(next);
  }

  return (
    <div className="quotation-form">
      <Layout>
      <Layout.Section>
        <QuotationFormSection
          description="Who is this quotation for?"
          title="Customer"
        >
          <CustomerPicker
            disabled={disabled}
            error={errors?.customer}
            onChange={(customer) => patch({ customer })}
            value={values.customer}
          />
        </QuotationFormSection>
      </Layout.Section>

      <Layout.Section>
        <QuotationFormSection
          description="Set the currency and validity window for this quote."
          title="Document"
        >
          <FormLayout>
            <CurrencyPicker
              currencies={currencies}
              disabled={disabled}
              error={errors?.currencyId ?? currenciesError ?? undefined}
              loading={currenciesLoading}
              onChange={(currencyId) => patch({ currencyId })}
              value={values.currencyId}
            />

            <FormLayout.Group>
              <TextField
                autoComplete="off"
                disabled={disabled}
                error={errors?.quoteDate}
                label="Quote date"
                onChange={(quoteDate) => patch({ quoteDate })}
                type="date"
                value={values.quoteDate}
              />
              <ValidityPeriodPicker
                disabled={disabled}
                onChange={({ preset, validityDate }) =>
                  patch({ validityPreset: preset, validityDate })
                }
                preset={values.validityPreset}
                quoteDate={values.quoteDate}
                validityDate={values.validityDate}
              />
            </FormLayout.Group>
          </FormLayout>
        </QuotationFormSection>
      </Layout.Section>

      <Layout.Section>
        <QuotationFormSection
          description="Optional references shown on the quotation."
          title="References"
        >
          <FormLayout>
            <FormLayout.Group>
              <TextField
                autoComplete="off"
                disabled={disabled}
                label="Customer reference"
                onChange={(customerReference) => patch({ customerReference })}
                placeholder="PO number, project code…"
                value={values.customerReference}
              />
              <TextField
                autoComplete="off"
                disabled={disabled}
                label="Internal reference"
                onChange={(internalReference) => patch({ internalReference })}
                placeholder="Your internal tracking ID"
                value={values.internalReference}
              />
            </FormLayout.Group>
            <TextField
              autoComplete="off"
              disabled={disabled}
              label="Payment reference"
              onChange={(paymentReference) => patch({ paymentReference })}
              placeholder="Shown on invoices and receipts"
              value={values.paymentReference}
            />
          </FormLayout>
        </QuotationFormSection>
      </Layout.Section>

      <Layout.Section>
        <QuotationFormSection
          description="Terms, scope, or a message for the customer."
          title="Customer Notes & Terms"
        >
          <DocumentNotesField
            autoComplete="off"
            disabled={disabled}
            label="Notes"
            labelHidden
            multiline={4}
            onChange={(notes) => patch({ notes })}
            placeholder="Add any notes visible to the customer on the quotation…"
            value={values.notes}
          />
        </QuotationFormSection>
      </Layout.Section>

      <Layout.Section>
        <QuotationFormSection
          description="Private notes for team members (never shown to customers)."
          title="Internal Team Notes"
        >
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text as="p" fontWeight="semibold">
                {values.internalNotes ? "Internal notes recorded" : "No internal notes recorded"}
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {values.internalNotes
                  ? values.internalNotes.length > 60
                    ? `${values.internalNotes.slice(0, 60)}…`
                    : values.internalNotes
                  : "Click the button to add private team notes for this quote."}
              </Text>
            </BlockStack>
            <Button
              onClick={() => {
                setTempInternalNotes(values.internalNotes || "");
                setInternalNotesOpen(true);
              }}
            >
              {values.internalNotes ? "Edit Internal Notes" : "Add Internal Notes"}
            </Button>
          </InlineStack>
        </QuotationFormSection>

        {/* Internal Notes Modal */}
        <Modal
          open={internalNotesOpen}
          onClose={() => setInternalNotesOpen(false)}
          title="Internal Team Notes"
          primaryAction={{
            content: "Save internal notes",
            onAction: () => {
              patch({ internalNotes: tempInternalNotes });
              setInternalNotesOpen(false);
            },
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setInternalNotesOpen(false),
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <Text as="p" tone="subdued">
                Internal team notes are preserved across quotes and converted invoices. They are visible only to your staff and will never appear on customer prints or PDFs.
              </Text>
              <TextField
                autoComplete="off"
                label="Internal Notes"
                labelHidden
                multiline={8}
                onChange={setTempInternalNotes}
                placeholder="Enter internal details, special pricing approvals, or delivery instructions for team members..."
                value={tempInternalNotes}
              />
            </FormLayout>
          </Modal.Section>
        </Modal>
      </Layout.Section>
    </Layout>
    </div>
  );
}
