"use client";

import {
  BlockStack,
  Button,
  Card,
  FormLayout,
  Text,
  TextField,
} from "@shopify/polaris";
import type { ReactNode } from "react";
import type {
  CreateWarehouseInput,
  Warehouse,
} from "@/types/warehouse";

export interface WarehouseFormValues {
  name: string;
  code: string;
  street1: string;
  city: string;
  zip: string;
  countryCode: string;
}

export function emptyWarehouseForm(): WarehouseFormValues {
  return {
    name: "",
    code: "",
    street1: "",
    city: "",
    zip: "",
    countryCode: "",
  };
}

export function warehouseToFormValues(warehouse: Warehouse): WarehouseFormValues {
  return {
    name: warehouse.name,
    code: warehouse.code,
    street1: warehouse.street1 ?? "",
    city: warehouse.city ?? "",
    zip: warehouse.zip ?? "",
    countryCode: warehouse.countryCode ?? "",
  };
}

export function formValuesToInput(
  values: WarehouseFormValues,
): CreateWarehouseInput {
  return {
    name: values.name,
    code: values.code,
    street1: values.street1 || undefined,
    city: values.city || undefined,
    zip: values.zip || undefined,
    countryCode: values.countryCode || undefined,
  };
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">
            {title}
          </Text>
          {description ? (
            <Text as="p" tone="subdued">
              {description}
            </Text>
          ) : null}
        </BlockStack>
        {children}
      </BlockStack>
    </Card>
  );
}

interface WarehouseFormProps {
  values: WarehouseFormValues;
  onChange: (values: WarehouseFormValues) => void;
  disabled?: boolean;
}

export function WarehouseForm({
  values,
  onChange,
  disabled,
}: WarehouseFormProps) {
  function update<K extends keyof WarehouseFormValues>(
    key: K,
    value: WarehouseFormValues[K],
  ) {
    onChange({ ...values, [key]: value });
  }

  return (
    <BlockStack gap="400">
      <FormSection
        description="Name and short code used across inventory."
        title="Warehouse details"
      >
        <FormLayout>
          <TextField
            autoComplete="off"
            disabled={disabled}
            label="Name"
            requiredIndicator
            value={values.name}
            onChange={(value) => update("name", value)}
          />
          <TextField
            autoComplete="off"
            disabled={disabled}
            helpText="Short unique code, e.g. WH01"
            label="Code"
            requiredIndicator
            value={values.code}
            onChange={(value) => update("code", value.toUpperCase())}
          />
        </FormLayout>
      </FormSection>

      <FormSection
        description="Optional address for this warehouse."
        title="Location"
      >
        <FormLayout>
          <TextField
            autoComplete="street-address"
            disabled={disabled}
            label="Street"
            value={values.street1}
            onChange={(value) => update("street1", value)}
          />
          <FormLayout.Group>
            <TextField
              autoComplete="address-level2"
              disabled={disabled}
              label="City"
              value={values.city}
              onChange={(value) => update("city", value)}
            />
            <TextField
              autoComplete="postal-code"
              disabled={disabled}
              label="ZIP / Postal code"
              value={values.zip}
              onChange={(value) => update("zip", value)}
            />
            <TextField
              autoComplete="off"
              disabled={disabled}
              label="Country code"
              maxLength={2}
              value={values.countryCode}
              onChange={(value) => update("countryCode", value.toUpperCase())}
            />
          </FormLayout.Group>
        </FormLayout>
      </FormSection>
    </BlockStack>
  );
}
