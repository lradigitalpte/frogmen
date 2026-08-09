"use client";

import { FormLayout, Layout, TextField } from "@shopify/polaris";
import type { Currency } from "@/lib/currencies-api";
import type { Vendor } from "@/types/vendor";
import { CurrencyPicker } from "@/components/sales/currency-picker";
import { QuotationFormSection } from "@/components/sales/quotation-form-section";
import { VendorPicker } from "@/components/purchasing/vendor-picker";

export interface PurchaseOrderHeaderValues {
  vendor: Vendor | null;
  currencyId: string;
  orderDate: string;
  expectedDate: string;
  vendorReference: string;
  internalReference: string;
}

interface PurchaseOrderHeaderFormProps {
  values: PurchaseOrderHeaderValues;
  currencies: Currency[];
  currenciesLoading?: boolean;
  currenciesError?: string | null;
  onChange: (values: PurchaseOrderHeaderValues) => void;
  disabled?: boolean;
  errors?: Partial<Record<keyof PurchaseOrderHeaderValues | "vendor", string>>;
}

export function PurchaseOrderHeaderForm({
  values,
  currencies,
  currenciesLoading,
  currenciesError,
  onChange,
  disabled,
  errors,
}: PurchaseOrderHeaderFormProps) {
  function patch(partial: Partial<PurchaseOrderHeaderValues>) {
    onChange({ ...values, ...partial });
  }

  return (
    <div className="quotation-form">
      <Layout>
        <Layout.Section>
          <QuotationFormSection
            description="Who are you ordering from?"
            title="Vendor"
          >
            <VendorPicker
              disabled={disabled}
              error={errors?.vendor}
              onChange={(vendor) => patch({ vendor })}
              value={values.vendor}
            />
          </QuotationFormSection>
        </Layout.Section>

        <Layout.Section>
          <QuotationFormSection
            description="Currency and expected delivery window."
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
                  error={errors?.orderDate}
                  label="Order date"
                  onChange={(orderDate) => patch({ orderDate })}
                  type="date"
                  value={values.orderDate}
                />
                <TextField
                  autoComplete="off"
                  disabled={disabled}
                  helpText="When you expect goods to arrive"
                  label="Expected delivery"
                  onChange={(expectedDate) => patch({ expectedDate })}
                  placeholder="Optional"
                  type="date"
                  value={values.expectedDate}
                />
              </FormLayout.Group>
            </FormLayout>
          </QuotationFormSection>
        </Layout.Section>

        <Layout.Section>
          <QuotationFormSection
            description="Optional references for tracking this PO."
            title="References"
          >
            <FormLayout>
              <FormLayout.Group>
                <TextField
                  autoComplete="off"
                  disabled={disabled}
                  label="Vendor reference"
                  onChange={(vendorReference) => patch({ vendorReference })}
                  placeholder="Supplier quote or PO number…"
                  value={values.vendorReference}
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
            </FormLayout>
          </QuotationFormSection>
        </Layout.Section>
      </Layout>
    </div>
  );
}
