"use client";

import type { ReactNode } from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  FormLayout,
  InlineGrid,
  InlineStack,
  Layout,
  RadioButton,
  Text,
  TextField,
} from "@shopify/polaris";
import type {
  CreateProductInput,
  Product,
  ProductEquipmentRole,
  ProductType,
  ProductUsageType,
} from "@/types/product";
import { ProductImagesUpload } from "./product-images-upload";
import {
  ProductSerialEntry,
  productSerialsAreValid,
} from "./product-serial-entry";
import { AppSelect } from "@/components/ui/app-select";
import { AppSearchSelect } from "@/components/ui/app-search-select";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { listCurrencies } from "@/lib/currencies-api";
import type { Currency } from "@/lib/currencies-api";
import { currencyById, currencyInputPrefix } from "@/lib/currency-utils";
import {
  buildClassificationTags,
  mergeProductTags,
  splitCustomTags,
} from "@/lib/product-tags";
import { useEffect, useMemo, useState } from "react";
import { ProductTagPicker } from "./product-tag-picker";
import { ProductCategoryPicker } from "./product-category-picker";
import { WarrantyPolicyPicker } from "@/components/warranty/warranty-policy-picker";
import {
  getCategoryBadgeTone,
  getProductBadgeTone,
} from "@/lib/product-badges";

export interface ProductFormValues {
  type: ProductType;
  name: string;
  reference: string;
  barcode: string;
  description: string;
  costPrice: string;
  sellingPrice: string;
  priceCurrencyId: string;
  parentId: string;
  equipmentRole: ProductEquipmentRole;
  usageType: ProductUsageType;
  isRovEquipment: boolean;
  isStorable: boolean;
  trackSerial: boolean;
  weight: string;
  volume: string;
  initialWarehouseId: string;
  initialSerials: string[];
  initialQuantity: string;
  tags: string[];
  categoryId: string;
  categoryName: string;
  defaultWarrantyPolicyId: string;
}

const EQUIPMENT_ROLE_OPTIONS: Array<{
  value: ProductEquipmentRole;
  title: string;
  shortTitle: string;
  hint: string;
}> = [
  {
    value: "general",
    title: "General product",
    shortTitle: "General",
    hint: "Sold by quantity   cables, consumables, everyday stock.",
  },
  {
    value: "main_equipment",
    title: "Main equipment",
    shortTitle: "Main ROV",
    hint: "Full ROV kit with a serial number per unit.",
  },
  {
    value: "component",
    title: "Component",
    shortTitle: "Component",
    hint: "Part of a main ROV. Parent can be linked later.",
  },
];

export function emptyProductForm(
  type: ProductType = "goods",
  parentId = "",
): ProductFormValues {
  return {
    type,
    name: "",
    reference: "",
    barcode: "",
    description: "",
    costPrice: "0",
    sellingPrice: "0",
    priceCurrencyId: "",
    parentId,
    equipmentRole: parentId ? "component" : "general",
    usageType: "for_sale",
    isRovEquipment: Boolean(parentId),
    isStorable: true,
    trackSerial: false,
    weight: "",
    volume: "",
    initialWarehouseId: "",
    initialSerials: [""],
    initialQuantity: "",
    tags: [],
    categoryId: "",
    categoryName: "",
    defaultWarrantyPolicyId: "",
  };
}

export function productToFormValues(product: Product): ProductFormValues {
  return {
    type: product.type,
    name: product.name,
    reference: product.sku ?? "",
    barcode: product.barcode ?? "",
    description: product.description ?? "",
    costPrice: product.costPrice ?? "0",
    sellingPrice: product.sellingPrice ?? "0",
    priceCurrencyId: product.priceCurrencyId ?? "",
    parentId: product.parentId ?? "",
    equipmentRole: product.equipmentRole ?? "general",
    usageType: product.usageType ?? "for_sale",
    isRovEquipment: product.isRovEquipment ?? false,
    isStorable: product.isStorable,
    trackSerial: product.trackSerial,
    weight: product.weight ?? "",
    volume: product.volume ?? "",
    initialWarehouseId: "",
    initialSerials: [""],
    initialQuantity: "",
    tags: splitCustomTags(product.tags ?? []),
    categoryId: product.categoryId ?? "",
    categoryName: "",
    defaultWarrantyPolicyId: product.defaultWarrantyPolicyId ?? "",
  };
}

export function formValuesToInput(
  values: ProductFormValues,
  options?: { includeInitialStock?: boolean },
): CreateProductInput {
  const input: CreateProductInput = {
    type: values.type,
    name: values.name,
    sku: values.reference || undefined,
    barcode: values.barcode || undefined,
    description: values.description || undefined,
    costPrice: values.costPrice || "0",
    sellingPrice:
      values.usageType === "for_sale" ? values.sellingPrice || "0" : undefined,
    priceCurrencyId: values.priceCurrencyId || undefined,
    parentId:
      values.equipmentRole === "component"
        ? values.parentId || undefined
        : undefined,
    equipmentRole: values.equipmentRole,
    usageType: values.usageType,
    isRovEquipment: values.isRovEquipment,
    isStorable: values.type === "goods" ? values.isStorable : false,
    trackSerial:
      values.type === "goods" && values.isStorable
        ? values.trackSerial
        : false,
    weight: values.weight || undefined,
    volume: values.volume || undefined,
    tags: mergeProductTags(
      values.tags,
      buildClassificationTags({
        type: values.type,
        usageType: values.usageType,
        isRovEquipment: values.isRovEquipment,
        equipmentRole: values.equipmentRole,
        trackSerial:
          values.type === "goods" && values.isStorable
            ? values.trackSerial
            : false,
      }),
    ),
    categoryId: values.categoryId || undefined,
    defaultWarrantyPolicyId: values.defaultWarrantyPolicyId || null,
  };

  if (options?.includeInitialStock && values.initialWarehouseId) {
    if (values.trackSerial) {
      const serialNumbers = values.initialSerials
        .map((serial) => serial.trim())
        .filter(Boolean);

      if (serialNumbers.length > 0) {
        input.initialStock = {
          warehouseId: values.initialWarehouseId,
          serialNumbers,
        };
      }
    } else if (values.initialQuantity.trim()) {
      input.initialStock = {
        warehouseId: values.initialWarehouseId,
        quantity: values.initialQuantity.trim(),
      };
    }
  }

  return input;
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

function EquipmentRolePicker({
  value,
  disabled,
  onChange,
}: {
  value: ProductEquipmentRole;
  disabled?: boolean;
  onChange: (role: ProductEquipmentRole) => void;
}) {
  const selected = EQUIPMENT_ROLE_OPTIONS.find((option) => option.value === value);

  return (
    <BlockStack gap="150">
      <div className="equipment-role-compact">
        <ButtonGroup variant="segmented" fullWidth>
          {EQUIPMENT_ROLE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              disabled={disabled}
              pressed={value === option.value}
              size="slim"
              onClick={() => onChange(option.value)}
            >
              {option.shortTitle}
            </Button>
          ))}
        </ButtonGroup>
      </div>
      {selected ? (
        <Text as="p" tone="subdued" variant="bodySm">
          {selected.hint}
        </Text>
      ) : null}
    </BlockStack>
  );
}

interface ProductFormProps {
  values: ProductFormValues;
  onChange: (values: ProductFormValues) => void;
  disabled?: boolean;
  productId?: string;
  images?: string[];
  pendingImages?: File[];
  parentOptions?: Array<{ label: string; value: string; description?: string }>;
  warehouseOptions?: Array<{ label: string; value: string; description?: string }>;
  lockParent?: boolean;
  lockedParentLabel?: string;
  onImagesChange?: (images: string[]) => void;
  onPendingImagesChange?: (files: File[]) => void;
}

export function ProductForm({
  values,
  onChange,
  disabled,
  productId,
  images = [],
  pendingImages = [],
  parentOptions = [],
  warehouseOptions = [],
  lockParent = false,
  lockedParentLabel,
  onImagesChange,
  onPendingImagesChange,
}: ProductFormProps) {
  const { catalogCurrencyId, defaultPricingCurrencyId } = useOrgCurrency();
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const isCreate = !productId;

  useEffect(() => {
    void listCurrencies()
      .then((rows) => setCurrencies(rows))
      .catch(() => setCurrencies([]));
  }, []);

  const selectedPriceCurrency = useMemo(
    () =>
      currencyById(currencies, values.priceCurrencyId) ??
      currencyById(currencies, defaultPricingCurrencyId) ??
      currencyById(currencies, catalogCurrencyId),
    [catalogCurrencyId, currencies, defaultPricingCurrencyId, values.priceCurrencyId],
  );
  const pricePrefix = currencyInputPrefix(selectedPriceCurrency);

  const dedupedParentOptions = useMemo(() => {
    const seen = new Set<string>();
    return parentOptions.filter((option) => {
      if (!option.value || seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });
  }, [parentOptions]);

  const parentSelectOptions = useMemo(() => {
    return dedupedParentOptions;
  }, [dedupedParentOptions]);

  const parentEmptyLabel =
    values.equipmentRole === "component" ? "None" : "None (top-level)";
  const parentEmptyDescription =
    values.equipmentRole === "component" ? "Link later" : "Standalone product";

  const currencyOptions = useMemo(
    () =>
      currencies.map((currency) => ({
        value: currency.id,
        label: currency.code,
        description: currency.name,
      })),
    [currencies],
  );

  const showInitialStock =
    isCreate &&
    values.type === "goods" &&
    values.isStorable &&
    Boolean(values.initialWarehouseId || warehouseOptions.length > 0);

  const classificationTags = useMemo(
    () =>
      buildClassificationTags({
        type: values.type,
        usageType: values.usageType,
        isRovEquipment: values.isRovEquipment,
        equipmentRole: values.equipmentRole,
        trackSerial:
          values.type === "goods" && values.isStorable
            ? values.trackSerial
            : false,
      }),
    [values],
  );

  function update<K extends keyof ProductFormValues>(
    key: K,
    value: ProductFormValues[K],
  ) {
    onChange({ ...values, [key]: value });
  }

  function setUsageType(usageType: ProductUsageType) {
    onChange({
      ...values,
      usageType,
      sellingPrice: usageType === "operations" ? "0" : values.sellingPrice,
    });
  }

  function setEquipmentRole(role: ProductEquipmentRole) {
    const autoRov =
      role === "main_equipment" || role === "component";

    onChange({
      ...values,
      equipmentRole: role,
      parentId: role === "component" ? values.parentId : "",
      isRovEquipment: autoRov ? true : values.isRovEquipment,
      trackSerial:
        role === "main_equipment" || role === "component"
          ? true
          : role === "general"
            ? false
            : values.trackSerial,
      isStorable:
        role === "main_equipment" || role === "component"
          ? true
          : values.isStorable,
    });
  }

  return (
    <Layout>
      <Layout.Section>
        <BlockStack gap="400">
          <FormSection title="General">
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
                label="Description"
                multiline={3}
                value={values.description}
                onChange={(value) => update("description", value)}
              />
            </FormLayout>
          </FormSection>

          <FormSection
            description="Product photos shown in lists and on the product page."
            title="Images"
          >
            <ProductImagesUpload
              disabled={disabled}
              images={images}
              pendingFiles={pendingImages}
              productId={productId}
              onImagesChange={onImagesChange}
              onPendingFilesChange={onPendingImagesChange}
            />
          </FormSection>

          {values.type === "goods" ? (
            <FormSection title="Inventory">
              <BlockStack gap="400">
                <Checkbox
                  checked={values.isStorable}
                  disabled={disabled}
                  helpText="Track stock levels for this product."
                  label="Track inventory"
                  onChange={(checked) =>
                    onChange({
                      ...values,
                      isStorable: checked,
                      trackSerial: checked ? values.trackSerial : false,
                    })
                  }
                />

                {values.isStorable ? (
                  <BlockStack gap="300">
                    <RadioButton
                      checked={!values.trackSerial}
                      disabled={
                        disabled ||
                        values.equipmentRole === "main_equipment" ||
                        values.equipmentRole === "component"
                      }
                      helpText="Restock by quantity   no serial numbers."
                      id="stock-by-quantity"
                      label="By quantity"
                      name="stock-tracking"
                      onChange={() => update("trackSerial", false)}
                    />
                    <RadioButton
                      checked={values.trackSerial}
                      disabled={disabled}
                      helpText="Each physical unit gets a unique serial."
                      id="stock-by-serial"
                      label="By serial number"
                      name="stock-tracking"
                      onChange={() => update("trackSerial", true)}
                    />
                  </BlockStack>
                ) : null}

                {showInitialStock ? (
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">
                      Initial stock
                    </Text>
                    <AppSearchSelect
                      disabled={disabled}
                      label="Warehouse"
                      options={warehouseOptions}
                      placeholder="Search warehouses…"
                      value={values.initialWarehouseId}
                      onChange={(value) => update("initialWarehouseId", value)}
                    />

                    {values.trackSerial ? (
                      <ProductSerialEntry
                        disabled={disabled}
                        serials={values.initialSerials}
                        onChange={(serials) => update("initialSerials", serials)}
                      />
                    ) : (
                      <TextField
                        autoComplete="off"
                        disabled={disabled}
                        helpText="Optional starting quantity in this warehouse."
                        label="Quantity on hand"
                        type="number"
                        value={values.initialQuantity}
                        onChange={(value) => update("initialQuantity", value)}
                      />
                    )}
                  </BlockStack>
                ) : null}

                <FormLayout.Group>
                  <TextField
                    autoComplete="off"
                    disabled={disabled}
                    label="Weight"
                    suffix="kg"
                    type="number"
                    value={values.weight}
                    onChange={(value) => update("weight", value)}
                  />
                  <TextField
                    autoComplete="off"
                    disabled={disabled}
                    label="Volume"
                    suffix="m³"
                    type="number"
                    value={values.volume}
                    onChange={(value) => update("volume", value)}
                  />
                </FormLayout.Group>
              </BlockStack>
            </FormSection>
          ) : null}
        </BlockStack>
      </Layout.Section>

      <Layout.Section variant="oneThird">
        <div className="product-form-sidebar">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Summary
                </Text>
                <InlineStack gap="200" wrap>
                  {values.categoryName ? (
                    <Badge tone={getCategoryBadgeTone()}>
                      {values.categoryName}
                    </Badge>
                  ) : null}
                  {classificationTags.map((tag) => (
                    <Badge key={`class-${tag}`} tone={getProductBadgeTone(tag)}>
                      {tag}
                    </Badge>
                  ))}
                  {values.tags.map((tag) => (
                    <Badge key={`custom-${tag}`}>{tag}</Badge>
                  ))}
                </InlineStack>
                {isCreate &&
                values.trackSerial &&
                values.initialSerials.some((serial) => serial.trim()) ? (
                  <Text as="p" tone="subdued" variant="bodySm">
                    {productSerialsAreValid(values.initialSerials)
                      ? `${values.initialSerials.filter((s) => s.trim()).length} serial(s) ready on save.`
                      : "Fix duplicate serial numbers before saving."}
                  </Text>
                ) : null}
              </BlockStack>
            </Card>

            <FormSection title="Settings">
              <BlockStack gap="300">
                <ButtonGroup variant="segmented" fullWidth>
                  <Button
                    disabled={disabled}
                    pressed={values.type === "goods"}
                    onClick={() => update("type", "goods")}
                  >
                    Goods
                  </Button>
                  <Button
                    disabled={disabled}
                    pressed={values.type === "service"}
                    onClick={() =>
                      onChange({
                        ...values,
                        type: "service",
                        isStorable: false,
                        trackSerial: false,
                        weight: "",
                        volume: "",
                      })
                    }
                  >
                    Service
                  </Button>
                </ButtonGroup>

                <FormLayout>
                  <TextField
                    autoComplete="off"
                    disabled={disabled}
                    label="Reference"
                    value={values.reference}
                    onChange={(value) => update("reference", value)}
                  />
                  {values.type === "goods" ? (
                    <TextField
                      autoComplete="off"
                      disabled={disabled}
                      label="Barcode"
                      value={values.barcode}
                      onChange={(value) => update("barcode", value)}
                    />
                  ) : null}
                </FormLayout>
              </BlockStack>
            </FormSection>

            <FormSection title="Purpose">
              <BlockStack gap="200">
                <div className="app-segmented-toggle">
                  <ButtonGroup variant="segmented" fullWidth>
                    <Button
                      disabled={disabled}
                      pressed={values.usageType === "for_sale"}
                      size="slim"
                      onClick={() => setUsageType("for_sale")}
                    >
                      For sale
                    </Button>
                    <Button
                      disabled={disabled}
                      pressed={values.usageType === "operations"}
                      size="slim"
                      onClick={() => setUsageType("operations")}
                    >
                      Operations
                    </Button>
                  </ButtonGroup>
                </div>
                <Text as="p" tone="subdued" variant="bodySm">
                  {values.usageType === "for_sale"
                    ? "On quotations and invoices."
                    : "Internal stock only."}
                </Text>
              </BlockStack>
            </FormSection>

            <FormSection title="Classification">
              <BlockStack gap="300">
                <ProductCategoryPicker
                  disabled={disabled}
                  value={values.categoryId}
                  onChange={(categoryId, categoryName) =>
                    onChange({
                      ...values,
                      categoryId,
                      categoryName: categoryName ?? "",
                    })
                  }
                />
                <WarrantyPolicyPicker
                  helpText="Applied automatically when this product is invoiced, unless overridden on a quotation line."
                  onChange={(defaultWarrantyPolicyId) =>
                    onChange({ ...values, defaultWarrantyPolicyId })
                  }
                  value={values.defaultWarrantyPolicyId}
                />
                <ProductTagPicker
                  disabled={disabled}
                  selected={values.tags}
                  onChange={(tags) => update("tags", tags)}
                />
              </BlockStack>
            </FormSection>

            {values.type === "goods" ? (
              <FormSection title="Product structure">
                <BlockStack gap="200">
                  <Checkbox
                    checked={values.isRovEquipment}
                    disabled={disabled}
                    helpText="ROV catalog, serial assembly, inspections."
                    label="ROV equipment"
                    onChange={(checked) =>
                      onChange({
                        ...values,
                        isRovEquipment: checked,
                        trackSerial:
                          checked &&
                          values.equipmentRole === "general" &&
                          !values.trackSerial
                            ? true
                            : values.trackSerial,
                      })
                    }
                  />

                  <EquipmentRolePicker
                    disabled={disabled}
                    value={values.equipmentRole}
                    onChange={setEquipmentRole}
                  />

                  {values.equipmentRole === "component" ||
                  (values.equipmentRole === "general" &&
                    dedupedParentOptions.length > 0) ? (
                    lockParent && values.parentId && lockedParentLabel ? (
                      <Box
                        background="bg-surface-secondary"
                        borderRadius="200"
                        padding="300"
                      >
                        <BlockStack gap="100">
                          <Text as="p" fontWeight="semibold" variant="bodySm">
                            Parent product
                          </Text>
                          <Text as="p" variant="bodyMd">
                            {lockedParentLabel}
                          </Text>
                        </BlockStack>
                      </Box>
                    ) : (
                      <AppSearchSelect
                        allowEmpty
                        disabled={disabled || lockParent}
                        emptyDescription={parentEmptyDescription}
                        emptyLabel={parentEmptyLabel}
                        helpText={
                          values.equipmentRole === "component"
                            ? "Optional   link later."
                            : undefined
                        }
                        label={
                          values.equipmentRole === "component"
                            ? "Parent product"
                            : "Parent (optional)"
                        }
                        options={parentSelectOptions}
                        placeholder="Search parent…"
                        value={values.parentId}
                        onChange={(nextValue) => update("parentId", nextValue)}
                      />
                    )
                  ) : null}
                </BlockStack>
              </FormSection>
            ) : null}

            <FormSection title="Pricing">
              <FormLayout>
                <AppSelect
                  disabled={disabled}
                  label="Price currency"
                  options={currencyOptions}
                  placeholder="Choose currency…"
                  value={values.priceCurrencyId}
                  onChange={(value) => update("priceCurrencyId", value)}
                />
                <TextField
                  autoComplete="off"
                  disabled={disabled}
                  label="Cost"
                  prefix={pricePrefix}
                  type="number"
                  value={values.costPrice}
                  onChange={(value) => update("costPrice", value)}
                />
                {values.usageType === "for_sale" ? (
                  <TextField
                    autoComplete="off"
                    disabled={disabled}
                    label="Selling price"
                    prefix={pricePrefix}
                    requiredIndicator
                    type="number"
                    value={values.sellingPrice}
                    onChange={(value) => update("sellingPrice", value)}
                  />
                ) : (
                  <Text as="p" tone="subdued" variant="bodySm">
                    Operations   cost only.
                  </Text>
                )}
              </FormLayout>
            </FormSection>
          </BlockStack>
        </div>
      </Layout.Section>
    </Layout>
  );
}
