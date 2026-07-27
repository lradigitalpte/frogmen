"use client";

import { FormLayout, Layout, TextField } from "@shopify/polaris";
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
          title="Notes"
        >
          <DocumentNotesField
            autoComplete="off"
            disabled={disabled}
            label="Notes"
            labelHidden
            multiline={5}
            onChange={(notes) => patch({ notes })}
            placeholder="Add any notes visible on the quotation…"
            value={values.notes}
          />
        </QuotationFormSection>
      </Layout.Section>
    </Layout>
    </div>
  );
}
