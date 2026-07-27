"use client";

import {
  Badge,
  BlockStack,
  Card,
  FormLayout,
  InlineGrid,
  Layout,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  countryHasStates,
  getCountryOptions,
  getStateOptions,
} from "@frog1/shared";
import type { VendorFormValues } from "@/types/vendor";
import { QuotationFormSection } from "@/components/sales/quotation-form-section";

interface VendorFormProps {
  values: VendorFormValues;
  onChange: (values: VendorFormValues) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}

function AccountTypeOption({
  title,
  badge,
  badgeTone,
  description,
  selected,
  onSelect,
  disabled,
}: {
  title: string;
  badge: string;
  badgeTone: "info" | "success" | undefined;
  description: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`frogmen-account-type-option${selected ? " selected" : ""}`}
      disabled={disabled}
      onClick={onSelect}
    >
      <BlockStack gap="200">
        <InlineGrid columns={2} gap="200">
          <Text as="span" fontWeight="semibold" variant="headingSm">
            {title}
          </Text>
          <Badge tone={selected ? badgeTone : undefined}>{badge}</Badge>
        </InlineGrid>
        <Text as="p" tone="subdued" variant="bodySm">
          {description}
        </Text>
      </BlockStack>
    </button>
  );
}

const countryOptions = [
  { label: "Select country", value: "" },
  ...getCountryOptions(),
];

function formatLocation(values: VendorFormValues) {
  const parts = [values.city, values.stateCode, values.countryCode].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(", ") : " ";
}

export function VendorForm({
  values,
  onChange,
  errors = {},
  disabled,
}: VendorFormProps) {
  const stateOptions = [
    { label: "Select state / province", value: "" },
    ...getStateOptions(values.countryCode),
  ];

  function update<K extends keyof VendorFormValues>(
    key: K,
    value: VendorFormValues[K],
  ) {
    onChange({ ...values, [key]: value });
  }

  const isCompany = values.accountType === "company";

  return (
    <div className="quotation-form">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <QuotationFormSection
              description="Choose whether this supplier is a company or an individual."
              title="Vendor account type"
            >
              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                <AccountTypeOption
                  badge="Supplier"
                  badgeTone="info"
                  description="Distributors, manufacturers, and commercial suppliers."
                  disabled={disabled}
                  selected={isCompany}
                  title="Company"
                  onSelect={() => update("accountType", "company")}
                />
                <AccountTypeOption
                  badge="Individual"
                  badgeTone="success"
                  description="Independent contractors or sole traders you purchase from."
                  disabled={disabled}
                  selected={!isCompany}
                  title="Individual"
                  onSelect={() => update("accountType", "individual")}
                />
              </InlineGrid>
            </QuotationFormSection>

            <QuotationFormSection
              description="Primary contact information and communication channels."
              title="Contact details"
            >
              <FormLayout>
                <TextField
                  autoComplete="organization"
                  disabled={disabled}
                  error={errors.name}
                  label={isCompany ? "Company / vendor name" : "Full name"}
                  placeholder={
                    isCompany
                      ? "e.g. Subsea Supply Co."
                      : "e.g. Ahmed Hassan"
                  }
                  requiredIndicator
                  value={values.name}
                  onChange={(value) => update("name", value)}
                />

                {isCompany ? (
                  <TextField
                    autoComplete="name"
                    disabled={disabled}
                    error={errors.contactName}
                    label="Primary contact name"
                    placeholder="e.g. Procurement Manager"
                    value={values.contactName}
                    onChange={(value) => update("contactName", value)}
                  />
                ) : null}

                <FormLayout.Group>
                  <TextField
                    autoComplete="email"
                    disabled={disabled}
                    error={errors.email}
                    label="Email address"
                    placeholder="e.g. orders@supplier.com"
                    type="email"
                    value={values.email}
                    onChange={(value) => update("email", value)}
                  />
                  <TextField
                    autoComplete="tel"
                    disabled={disabled}
                    error={errors.phone}
                    label="Office phone"
                    placeholder="e.g. +971 4 123 4567"
                    value={values.phone}
                    onChange={(value) => update("phone", value)}
                  />
                </FormLayout.Group>

                <FormLayout.Group>
                  <TextField
                    autoComplete="tel"
                    disabled={disabled}
                    error={errors.mobile}
                    label="Mobile"
                    placeholder="e.g. +971 50 123 4567"
                    value={values.mobile}
                    onChange={(value) => update("mobile", value)}
                  />
                  <TextField
                    autoComplete="off"
                    disabled={disabled}
                    error={errors.website}
                    label="Website"
                    placeholder="e.g. https://supplier.com"
                    value={values.website}
                    onChange={(value) => update("website", value)}
                  />
                </FormLayout.Group>
              </FormLayout>
            </QuotationFormSection>

            <QuotationFormSection
              description="Tax identifiers and internal reference codes."
              title="Tax & references"
            >
              <FormLayout>
                <FormLayout.Group>
                  <TextField
                    autoComplete="off"
                    disabled={disabled}
                    error={errors.taxId}
                    label="Tax ID / VAT"
                    placeholder="e.g. TRN or VAT number"
                    value={values.taxId}
                    onChange={(value) => update("taxId", value)}
                  />
                  <TextField
                    autoComplete="off"
                    disabled={disabled}
                    error={errors.reference}
                    label="Internal reference"
                    placeholder="e.g. VND-2026-001"
                    value={values.reference}
                    onChange={(value) => update("reference", value)}
                  />
                </FormLayout.Group>
              </FormLayout>
            </QuotationFormSection>

            <QuotationFormSection
              description="Billing address and delivery location for this vendor."
              title="Address"
            >
              <FormLayout>
                <TextField
                  autoComplete="street-address"
                  disabled={disabled}
                  error={errors.street1}
                  label="Street address"
                  placeholder="e.g. Warehouse District, Plot 12"
                  value={values.street1}
                  onChange={(value) => update("street1", value)}
                />
                <TextField
                  autoComplete="address-line2"
                  disabled={disabled}
                  error={errors.street2}
                  label="Suite, building, floor (optional)"
                  placeholder="e.g. Building B, Unit 4"
                  value={values.street2}
                  onChange={(value) => update("street2", value)}
                />
                <FormLayout.Group>
                  <TextField
                    autoComplete="address-level2"
                    disabled={disabled}
                    error={errors.city}
                    label="City"
                    placeholder="e.g. Dubai"
                    value={values.city}
                    onChange={(value) => update("city", value)}
                  />
                  <TextField
                    autoComplete="postal-code"
                    disabled={disabled}
                    error={errors.zip}
                    label="ZIP / postal code"
                    placeholder="e.g. 00000"
                    value={values.zip}
                    onChange={(value) => update("zip", value)}
                  />
                </FormLayout.Group>
                <FormLayout.Group>
                  <Select
                    disabled={disabled}
                    error={errors.countryCode}
                    label="Country"
                    options={countryOptions}
                    value={values.countryCode}
                    onChange={(value) =>
                      onChange({ ...values, countryCode: value, stateCode: "" })
                    }
                  />
                  {countryHasStates(values.countryCode) ? (
                    <Select
                      disabled={disabled}
                      error={errors.stateCode}
                      label="State / province"
                      options={stateOptions}
                      value={values.stateCode}
                      onChange={(value) => update("stateCode", value)}
                    />
                  ) : null}
                </FormLayout.Group>
              </FormLayout>
            </QuotationFormSection>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Vendor summary
                </Text>
                <div className="quotation-summary-panel__rows">
                  <div className="quotation-summary-row">
                    <Text as="span" tone="subdued" variant="bodySm">
                      Type
                    </Text>
                    <Badge tone={isCompany ? "info" : "success"}>
                      {isCompany ? "Company" : "Individual"}
                    </Badge>
                  </div>
                  <div className="quotation-summary-row">
                    <Text as="span" tone="subdued" variant="bodySm">
                      Name
                    </Text>
                    <Text as="span" fontWeight="semibold">
                      {values.name.trim() || " "}
                    </Text>
                  </div>
                  <div className="quotation-summary-row">
                    <Text as="span" tone="subdued" variant="bodySm">
                      Email
                    </Text>
                    <Text as="span">{values.email.trim() || " "}</Text>
                  </div>
                  <div className="quotation-summary-row">
                    <Text as="span" tone="subdued" variant="bodySm">
                      Phone
                    </Text>
                    <Text as="span">
                      {values.phone.trim() || values.mobile.trim() || " "}
                    </Text>
                  </div>
                  <div className="quotation-summary-row">
                    <Text as="span" tone="subdued" variant="bodySm">
                      Location
                    </Text>
                    <Text as="span">{formatLocation(values)}</Text>
                  </div>
                </div>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Used for
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Vendors appear on purchase orders and goods receipts. You can
                  assign a default currency per vendor when creating POs.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </div>
  );
}
