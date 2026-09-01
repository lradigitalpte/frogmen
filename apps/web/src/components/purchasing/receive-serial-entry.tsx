"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Divider,
  Icon,
  IndexTable,
  InlineStack,
  Modal,
  Spinner,
  Tag,
  Text,
  TextField,
} from "@shopify/polaris";
import { Link2Icon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatQuantity } from "@/lib/format-quantity";
import {
  getSoldUnitCandidates,
  type SoldUnitCandidate,
} from "@/lib/purchase-orders-api";

interface ReceiveSerialEntryProps {
  productId?: string;
  quantity: number;
  serials: string[];
  disabled?: boolean;
  onChange: (serials: string[]) => void;
}

function normalizeSerial(value: string) {
  return value.trim();
}

function findDuplicateIndexes(serials: string[]) {
  const seen = new Map<string, number>();
  const duplicates = new Set<number>();

  serials.forEach((serial, index) => {
    const normalized = normalizeSerial(serial);
    if (!normalized) return;

    const firstIndex = seen.get(normalized);
    if (firstIndex !== undefined) {
      duplicates.add(firstIndex);
      duplicates.add(index);
      return;
    }

    seen.set(normalized, index);
  });

  return duplicates;
}

export function ReceiveSerialEntry({
  productId,
  quantity,
  serials,
  disabled,
  onChange,
}: ReceiveSerialEntryProps) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");

  // Sold candidates linking modal
  const [soldModalOpen, setSoldModalOpen] = useState(false);
  const [soldLoading, setSoldLoading] = useState(false);
  const [soldCandidates, setSoldCandidates] = useState<SoldUnitCandidate[]>([]);
  const [soldSearch, setSoldSearch] = useState("");
  const [soldError, setSoldError] = useState<string | null>(null);

  const filledCount = useMemo(
    () => serials.filter((serial) => normalizeSerial(serial)).length,
    [serials],
  );

  const duplicateIndexes = useMemo(
    () => findDuplicateIndexes(serials),
    [serials],
  );

  async function loadSoldCandidates() {
    if (!productId) return;
    setSoldLoading(true);
    setSoldError(null);
    try {
      const res = await getSoldUnitCandidates(productId, soldSearch);
      setSoldCandidates(res.data ?? []);
    } catch (err: any) {
      setSoldError(err.message || "Failed to load sold units");
    } finally {
      setSoldLoading(false);
    }
  }

  useEffect(() => {
    if (soldModalOpen && productId) {
      void loadSoldCandidates();
    }
  }, [soldModalOpen, productId]);

  function updateSerial(index: number, value: string) {
    const next = [...serials];
    next[index] = value;
    onChange(next);
  }

  function removeSerial(index: number) {
    const next = [...serials];
    next[index] = "";
    onChange(next);
  }

  function selectSoldCandidate(candidate: SoldUnitCandidate) {
    // Find the first empty slot or replace slot 0
    const emptyIndex = serials.findIndex((s) => !normalizeSerial(s));
    const targetIndex = emptyIndex !== -1 ? emptyIndex : 0;
    const next = [...serials];
    next[targetIndex] = candidate.serialNumber;
    onChange(next);
    setSoldModalOpen(false);
  }

  function applyPaste() {
    const parsed = pasteValue
      .split(/[\n,;]+/)
      .map((value) => normalizeSerial(value))
      .filter(Boolean);

    const next = [...serials];
    for (let index = 0; index < quantity; index += 1) {
      next[index] = parsed[index] ?? next[index] ?? "";
    }

    onChange(next);
    setPasteValue("");
    setPasteOpen(false);
  }

  if (quantity <= 0) {
    return (
      <Text as="p" tone="subdued" variant="bodySm">
        Set a quantity above zero to enter serial numbers.
      </Text>
    );
  }

  return (
    <BlockStack gap="300">
      <InlineStack align="space-between" blockAlign="center" wrap>
        <BlockStack gap="100">
          <Text as="span" fontWeight="semibold">
            Serial numbers
          </Text>
          <Text as="span" tone="subdued" variant="bodySm">
            Enter one unique serial per unit, or link to an existing sold product on an invoice.
          </Text>
        </BlockStack>
        <Badge tone={filledCount === quantity ? "success" : "info"}>
          {`${filledCount} / ${quantity} entered`}
        </Badge>
      </InlineStack>

      <BlockStack gap="200">
        {Array.from({ length: quantity }, (_, index) => {
          const value = serials[index] ?? "";
          const isDuplicate = duplicateIndexes.has(index);

          return (
            <TextField
              key={`serial-${index}`}
              autoComplete="off"
              disabled={disabled}
              error={
                isDuplicate
                  ? "Duplicate serial number"
                  : undefined
              }
              label={`Serial ${index + 1}`}
              placeholder={`e.g. SN-${String(index + 1).padStart(3, "0")}`}
              value={value}
              onChange={(nextValue) => updateSerial(index, nextValue)}
            />
          );
        })}
      </BlockStack>

      {filledCount > 0 ? (
        <InlineStack gap="150" wrap>
          {serials.map((serial, index) => {
            const normalized = normalizeSerial(serial);
            if (!normalized) return null;

            return (
              <Tag
                key={`tag-${index}-${normalized}`}
                onRemove={disabled ? undefined : () => removeSerial(index)}
              >
                {normalized}
              </Tag>
            );
          })}
        </InlineStack>
      ) : null}

      {duplicateIndexes.size > 0 ? (
        <Text as="p" tone="critical" variant="bodySm">
          Serial numbers must be unique within this receipt line.
        </Text>
      ) : null}

      {filledCount < quantity ? (
        <Text as="p" tone="subdued" variant="bodySm">
          {quantity - filledCount} more serial
          {quantity - filledCount === 1 ? "" : "s"} required before validating.
        </Text>
      ) : null}

      <InlineStack gap="300" wrap>
        {productId ? (
          <Button
            disabled={disabled}
            icon={Link2Icon}
            onClick={() => setSoldModalOpen(true)}
          >
            Link to Sold Product / Invoice
          </Button>
        ) : null}

        <Button
          disabled={disabled}
          variant="plain"
          onClick={() => setPasteOpen((current) => !current)}
        >
          {pasteOpen ? "Hide paste box" : "Paste multiple serials"}
        </Button>
      </InlineStack>

      {pasteOpen ? (
        <BlockStack gap="200">
          <TextField
            autoComplete="off"
            disabled={disabled}
            helpText="Separate with new lines, commas, or semicolons"
            label="Paste serial numbers"
            multiline={4}
            value={pasteValue}
            onChange={setPasteValue}
          />
          <InlineStack gap="200">
            <Button disabled={disabled || !pasteValue.trim()} onClick={applyPaste}>
              Apply to fields
            </Button>
          </InlineStack>
        </BlockStack>
      ) : null}

      {/* Sold Product Units Linking Modal */}
      <Modal
        open={soldModalOpen}
        onClose={() => setSoldModalOpen(false)}
        title="Link to Sold Product Unit on Invoice"
        size="large"
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              Selecting a previously sold product unit will link this PO landed purchase cost directly to that customer invoice line and COGS calculation without creating duplicate in-stock units.
            </Banner>

            <InlineStack gap="200">
              <div style={{ flex: 1 }}>
                <TextField
                  label="Search sold serials, invoices, or customers"
                  labelHidden
                  placeholder="Search by serial number, invoice number, or customer name..."
                  value={soldSearch}
                  onChange={setSoldSearch}
                  autoComplete="off"
                  prefix={<Icon source={SearchIcon} />}
                  connectedRight={
                    <Button onClick={() => void loadSoldCandidates()} loading={soldLoading}>
                      Search
                    </Button>
                  }
                />
              </div>
            </InlineStack>

            {soldError ? <Banner tone="critical">{soldError}</Banner> : null}

            {soldLoading ? (
              <Box padding="800">
                <InlineStack align="center">
                  <Spinner size="large" />
                </InlineStack>
              </Box>
            ) : soldCandidates.length === 0 ? (
              <Box padding="600" background="bg-surface-secondary" borderRadius="200">
                <InlineStack align="center">
                  <Text as="p" tone="subdued">
                    No sold units found for this product. If the item was not marked as sold on an invoice, you can receive it as a regular unit.
                  </Text>
                </InlineStack>
              </Box>
            ) : (
              <IndexTable
                resourceName={{ singular: "sold unit", plural: "sold units" }}
                itemCount={soldCandidates.length}
                selectable={false}
                headings={[
                  { title: "Serial Number" },
                  { title: "Invoice #" },
                  { title: "Customer" },
                  { title: "Sale Date" },
                  { title: "Unit Sale Price" },
                  { title: "Action", alignment: "end" },
                ]}
              >
                {soldCandidates.map((c, i) => (
                  <IndexTable.Row key={c.unitId} id={c.unitId} position={i}>
                    <IndexTable.Cell>
                      <Text as="span" fontWeight="bold">
                        {c.serialNumber}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {c.invoiceNumber ? (
                        <Badge tone="info">{c.invoiceNumber}</Badge>
                      ) : (
                        <Text as="span" tone="subdued">
                          Direct Sale
                        </Text>
                      )}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span">{c.customerName || "—"}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" tone="subdued" variant="bodySm">
                        {c.invoiceDate
                          ? new Date(c.invoiceDate).toLocaleDateString()
                          : new Date(c.updatedAt).toLocaleDateString()}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span">
                        {c.unitPrice
                          ? `${Number(c.unitPrice).toFixed(2)} ${c.currencyCode || ""}`
                          : "—"}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <InlineStack align="end">
                        <Button
                          size="slim"
                          variant="primary"
                          onClick={() => selectSoldCandidate(c)}
                        >
                          Select Serial
                        </Button>
                      </InlineStack>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}

export function buildSerialSlots(quantity: number, existing: string[] = []) {
  const slots: string[] = [];
  for (let index = 0; index < quantity; index += 1) {
    slots.push(existing[index] ?? "");
  }
  return slots;
}

export function serialsAreValid(quantity: number, serials: string[]) {
  if (quantity <= 0) return false;

  const normalized = serials
    .slice(0, quantity)
    .map((serial) => normalizeSerial(serial))
    .filter(Boolean);

  if (normalized.length !== quantity) return false;

  return new Set(normalized).size === normalized.length;
}

export function formatReceiveQuantity(value: string | number) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "1";
  return formatQuantity(value);
}
