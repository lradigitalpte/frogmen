"use client";

import {
  Banner,
  BlockStack,
  Box,
  Button,
  InlineStack,
  Modal,
  Text,
  TextField,
} from "@shopify/polaris";
import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  productUnitStatusLabel,
  productUnitStatusVariant,
  StatusBadge,
} from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { linkProductUnit, listLinkableUnits } from "@/lib/products-api";
import type { LinkableProductUnit, ProductDetail, ProductUnit } from "@/types/product";

export interface LinkableUnitOption {
  id: string;
  serialNumber: string;
  productId: string;
  productName: string;
  warehouseName?: string;
  status: ProductUnit["status"];
  parentUnitId: string | null;
  isSubProduct: boolean;
}

interface LinkComponentModalProps {
  open: boolean;
  product: ProductDetail;
  parentUnits: ProductUnit[];
  onClose: () => void;
  onLinked: () => void | Promise<void>;
}

function UnitPickRow({
  unit,
  selected,
  onSelect,
}: {
  unit: LinkableUnitOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0",
        "hover:bg-muted/50",
        selected && "bg-primary/5",
      )}
      type="button"
      onClick={onSelect}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
          selected ? "border-primary bg-primary" : "border-muted-foreground/40",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{unit.productName}</div>
        <div className="truncate text-xs text-muted-foreground">
          S/N {unit.serialNumber}
          {unit.warehouseName ? ` · ${unit.warehouseName}` : ""}
          {!unit.isSubProduct ? " · Standalone" : ""}
        </div>
      </div>
      <StatusBadge variant={productUnitStatusVariant(unit.status)}>
        {productUnitStatusLabel(unit.status)}
      </StatusBadge>
    </button>
  );
}

function ScrollableUnitList({
  children,
  empty,
}: {
  children?: ReactNode;
  empty?: ReactNode;
}) {
  if (empty) {
    return <Box padding="300">{empty}</Box>;
  }

  return (
    <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-card">
      {children}
    </div>
  );
}

function toLinkableOption(unit: LinkableProductUnit): LinkableUnitOption {
  return {
    id: unit.id,
    serialNumber: unit.serialNumber,
    productId: unit.productId,
    productName: unit.productName,
    warehouseName: unit.warehouseName,
    status: unit.status,
    parentUnitId: unit.parentUnitId,
    isSubProduct: unit.isSubProduct,
  };
}

function matchesQuery(unit: LinkableUnitOption, query: string) {
  const haystack = [
    unit.productName,
    unit.serialNumber,
    unit.warehouseName ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export function LinkComponentModal({
  open,
  product,
  parentUnits,
  onClose,
  onLinked,
}: LinkComponentModalProps) {
  const [partSearch, setPartSearch] = useState("");
  const [rovSearch, setRovSearch] = useState("");
  const [debouncedPartSearch, setDebouncedPartSearch] = useState("");
  const [componentUnits, setComponentUnits] = useState<LinkableUnitOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState("");
  const [selectedParentId, setSelectedParentId] = useState("");

  const parentCandidates = useMemo<LinkableUnitOption[]>(
    () =>
      parentUnits
        .filter((unit) => !unit.parentUnitId)
        .map((unit) => ({
          id: unit.id,
          serialNumber: unit.serialNumber,
          productId: product.id,
          productName: product.name,
          warehouseName: unit.warehouseName,
          status: unit.status,
          parentUnitId: unit.parentUnitId,
          isSubProduct: true,
        })),
    [parentUnits, product.id, product.name],
  );

  const filteredParentCandidates = useMemo(() => {
    const query = rovSearch.trim().toLowerCase();
    if (!query) return parentCandidates;
    return parentCandidates.filter((unit) => matchesQuery(unit, query));
  }, [parentCandidates, rovSearch]);

  const selectedComponent = useMemo(
    () => componentUnits.find((unit) => unit.id === selectedComponentId),
    [componentUnits, selectedComponentId],
  );
  const selectedParent = useMemo(
    () => parentCandidates.find((unit) => unit.id === selectedParentId),
    [parentCandidates, selectedParentId],
  );

  const canLink =
    Boolean(selectedComponentId) &&
    Boolean(selectedParentId) &&
    selectedComponentId !== selectedParentId;

  const shouldSearchParts = debouncedPartSearch.trim().length > 0;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedPartSearch(partSearch), 300);
    return () => clearTimeout(timer);
  }, [partSearch]);

  const loadParts = useCallback(async () => {
    if (!shouldSearchParts) {
      setComponentUnits([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await listLinkableUnits(product.id, {
        search: debouncedPartSearch.trim(),
        perPage: 30,
      });
      setComponentUnits(result.data.map(toLinkableOption));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load component units",
      );
      setComponentUnits([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedPartSearch, product.id, shouldSearchParts]);

  useEffect(() => {
    if (!open) {
      setPartSearch("");
      setRovSearch("");
      setDebouncedPartSearch("");
      setSelectedComponentId("");
      setSelectedParentId("");
      setComponentUnits([]);
      setError(null);
      return;
    }

    void loadParts();
  }, [open, loadParts]);

  async function handleLink() {
    if (!canLink) return;

    setSaving(true);
    setError(null);

    try {
      await linkProductUnit(selectedComponentId, selectedParentId);
      setSelectedComponentId("");
      setSelectedParentId("");
      await onLinked();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link units");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      primaryAction={{
        content: "Attach component",
        disabled: !canLink,
        loading: saving,
        onAction: handleLink,
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
      title="Attach part to ROV"
      onClose={onClose}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <BlockStack gap="300">
            <Text as="p" fontWeight="semibold" variant="bodyMd">
              1. Part serial
            </Text>
            <TextField
              autoComplete="off"
              clearButton
              label="Search parts"
              labelHidden
              onChange={setPartSearch}
              onClearButtonClick={() => setPartSearch("")}
              placeholder="Search by part name, SKU, or serial…"
              value={partSearch}
            />

            {!shouldSearchParts ? (
              <ScrollableUnitList
                empty={
                  <Text as="p" tone="subdued" variant="bodySm">
                    Type to search unlinked part serials. Results are loaded on
                    demand so large inventories stay fast.
                  </Text>
                }
              />
            ) : loading ? (
              <ScrollableUnitList
                empty={
                  <Text as="p" tone="subdued" variant="bodySm">
                    Searching parts…
                  </Text>
                }
              />
            ) : componentUnits.length === 0 ? (
              <Box
                background="bg-surface-secondary"
                borderRadius="200"
                padding="300"
              >
                <BlockStack gap="200">
                  <Text as="p" tone="subdued" variant="bodySm">
                    No matching part serials for &quot;{debouncedPartSearch}
                    &quot;.
                  </Text>
                  <InlineStack gap="200" wrap>
                    <Button
                      size="slim"
                      url={`/dashboard/inventory/products/new?parentId=${product.id}`}
                    >
                      Create part
                    </Button>
                    <Button
                      size="slim"
                      url="/dashboard/inventory/products/new"
                      variant="tertiary"
                    >
                      New component
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Box>
            ) : (
              <BlockStack gap="150">
                <Text as="p" tone="subdued" variant="bodySm">
                  {componentUnits.length} match
                  {componentUnits.length === 1 ? "" : "es"}
                  {componentUnits.length >= 30 ? " (showing first 30)" : ""}
                </Text>
                <ScrollableUnitList>
                  {componentUnits.map((unit) => (
                    <UnitPickRow
                      key={unit.id}
                      selected={selectedComponentId === unit.id}
                      unit={unit}
                      onSelect={() => setSelectedComponentId(unit.id)}
                    />
                  ))}
                </ScrollableUnitList>
              </BlockStack>
            )}
          </BlockStack>

          <BlockStack gap="300">
            <Text as="p" fontWeight="semibold" variant="bodyMd">
              2. Main ROV serial
            </Text>
            <TextField
              autoComplete="off"
              clearButton
              label="Filter ROV serials"
              labelHidden
              onChange={setRovSearch}
              onClearButtonClick={() => setRovSearch("")}
              placeholder={`Filter ${product.name} serials…`}
              value={rovSearch}
            />

            {parentCandidates.length === 0 ? (
              <Box
                background="bg-surface-secondary"
                borderRadius="200"
                padding="300"
              >
                <Text as="p" tone="subdued" variant="bodySm">
                  No ROV serials on {product.name} yet. Add a main unit serial
                  first.
                </Text>
              </Box>
            ) : filteredParentCandidates.length === 0 ? (
              <ScrollableUnitList
                empty={
                  <Text as="p" tone="subdued" variant="bodySm">
                    No ROV serials match your filter.
                  </Text>
                }
              />
            ) : (
              <BlockStack gap="150">
                <Text as="p" tone="subdued" variant="bodySm">
                  {filteredParentCandidates.length} of {parentCandidates.length}{" "}
                  serial{parentCandidates.length === 1 ? "" : "s"}
                </Text>
                <ScrollableUnitList>
                  {filteredParentCandidates.map((unit) => (
                    <UnitPickRow
                      key={unit.id}
                      selected={selectedParentId === unit.id}
                      unit={unit}
                      onSelect={() => setSelectedParentId(unit.id)}
                    />
                  ))}
                </ScrollableUnitList>
              </BlockStack>
            )}
          </BlockStack>

          {selectedComponent && selectedParent ? (
            <Box
              background="bg-surface-success"
              borderColor="border-success"
              borderRadius="200"
              borderWidth="025"
              padding="300"
            >
              <InlineStack align="start" blockAlign="center" gap="200" wrap>
                <Text as="span" fontWeight="semibold" variant="bodySm">
                  {selectedComponent.productName} · S/N{" "}
                  {selectedComponent.serialNumber}
                </Text>
                <ArrowRight aria-hidden className="text-primary" size={14} />
                <Text as="span" fontWeight="semibold" variant="bodySm">
                  {selectedParent.productName} · S/N {selectedParent.serialNumber}
                </Text>
              </InlineStack>
              {!selectedComponent.isSubProduct ? (
                <Text as="p" tone="subdued" variant="bodySm">
                  The part product will also be linked to {product.name} in your
                  catalog.
                </Text>
              ) : null}
            </Box>
          ) : null}

          {error ? (
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          ) : null}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
