"use client";

import { Badge, Banner, Button, Icon, Modal, Spinner, TextField } from "@shopify/polaris";
import { ArrowDownIcon, CheckIcon, SearchIcon } from "@shopify/polaris-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { productUnitStatusLabel } from "@/components/ui/status-badge";
import { linkProductUnit, listLinkableUnits } from "@/lib/products-api";
import { cn } from "@/lib/utils";
import type { LinkableProductUnit, ProductDetail, ProductUnit } from "@/types/product";

export interface LinkableUnitOption {
  id: string;
  serialNumber: string;
  productId: string;
  productName: string;
  productSku?: string | null;
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

const PART_LIMIT = 30;
const STATUS_RANK: Record<ProductUnit["status"], number> = { in_stock: 0, assigned: 1, sold: 2, scrapped: 3 };

function statusTone(status: ProductUnit["status"]) {
  if (status === "in_stock") return "success" as const;
  if (status === "assigned") return "info" as const;
  if (status === "scrapped") return "critical" as const;
  return undefined;
}

function toOption(unit: LinkableProductUnit): LinkableUnitOption {
  return {
    id: unit.id,
    serialNumber: unit.serialNumber,
    productId: unit.productId,
    productName: unit.productName,
    productSku: unit.productSku,
    warehouseName: unit.warehouseName,
    status: unit.status,
    parentUnitId: unit.parentUnitId,
    isSubProduct: Boolean(unit.isSubProduct),
  };
}

function OptionRow({
  unit,
  selected,
  title,
  onSelect,
  name,
}: {
  unit: LinkableUnitOption;
  selected: boolean;
  title: string;
  name: string;
  onSelect: () => void;
}) {
  return (
    <label className={cn("lc-option", selected && "is-selected")}>
      <input checked={selected} className="lc-option__input" name={name} type="radio" onChange={onSelect} />
      <span className="lc-option__radio" aria-hidden>
        {selected ? <Icon source={CheckIcon} /> : null}
      </span>
      <span className="lc-option__text">
        <strong>{title}</strong>
        <small>
          {[unit.warehouseName, unit.isSubProduct ? null : unit.productSku].filter(Boolean).join(" · ") || "No warehouse"}
        </small>
      </span>
      <Badge tone={statusTone(unit.status)}>{productUnitStatusLabel(unit.status)}</Badge>
    </label>
  );
}

function Chosen({ label, title, meta, onChange }: { label: string; title: string; meta: string; onChange: () => void }) {
  return (
    <div className="lc-chosen">
      <span className="lc-chosen__check" aria-hidden>
        <Icon source={CheckIcon} />
      </span>
      <span className="lc-chosen__text">
        <small>{label}</small>
        <strong>{title}</strong>
        <em>{meta}</em>
      </span>
      <Button size="slim" variant="plain" onClick={onChange}>
        Change
      </Button>
    </div>
  );
}

export function LinkComponentModal({ open, product, parentUnits, onClose, onLinked }: LinkComponentModalProps) {
  const [partSearch, setPartSearch] = useState("");
  const [debouncedPartSearch, setDebouncedPartSearch] = useState("");
  const [parentSearch, setParentSearch] = useState("");
  const [parts, setParts] = useState<LinkableUnitOption[]>([]);
  const [partsTotal, setPartsTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [part, setPart] = useState<LinkableUnitOption | null>(null);
  const [parentId, setParentId] = useState("");
  const [editingParent, setEditingParent] = useState(true);
  const requestRef = useRef(0);

  // Main-unit serials that can take a part: not themselves attached, not scrapped. In-stock first.
  const parentCandidates = useMemo<LinkableUnitOption[]>(
    () =>
      parentUnits
        .filter((unit) => !unit.parentUnitId && unit.status !== "scrapped")
        .map((unit) => ({
          id: unit.id,
          serialNumber: unit.serialNumber,
          productId: product.id,
          productName: product.name,
          warehouseName: unit.warehouseName,
          status: unit.status,
          parentUnitId: unit.parentUnitId,
          isSubProduct: true,
        }))
        .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.serialNumber.localeCompare(b.serialNumber)),
    [parentUnits, product.id, product.name],
  );

  const filteredParents = useMemo(() => {
    const q = parentSearch.trim().toLowerCase();
    if (!q) return parentCandidates;
    return parentCandidates.filter((u) => `${u.serialNumber} ${u.warehouseName ?? ""}`.toLowerCase().includes(q));
  }, [parentCandidates, parentSearch]);

  const parent = parentCandidates.find((u) => u.id === parentId) ?? null;

  // Reset on open/close; preselect the only in-stock main unit.
  useEffect(() => {
    if (open) {
      const inStock = parentCandidates.filter((u) => u.status === "in_stock");
      if (inStock.length === 1) {
        setParentId(inStock[0].id);
        setEditingParent(false);
      }
      return;
    }
    setPartSearch("");
    setDebouncedPartSearch("");
    setParentSearch("");
    setParts([]);
    setPart(null);
    setParentId("");
    setEditingParent(true);
    setError(null);
    // parentCandidates intentionally read only when the modal opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedPartSearch(partSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [partSearch]);

  // Load part suggestions as soon as the modal opens, then on every search.
  useEffect(() => {
    if (!open) return;
    const request = ++requestRef.current;
    setLoading(true);
    listLinkableUnits(product.id, { search: debouncedPartSearch || undefined, perPage: PART_LIMIT })
      .then((result) => {
        if (request !== requestRef.current) return;
        const options = result.data
          .map(toOption)
          .filter((u) => u.status !== "scrapped")
          .sort(
            (a, b) =>
              Number(b.isSubProduct) - Number(a.isSubProduct) ||
              STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
              a.productName.localeCompare(b.productName),
          );
        setParts(options);
        setPartsTotal(result.meta.total);
      })
      .catch((err) => {
        if (request !== requestRef.current) return;
        setError(err instanceof Error ? err.message : "Couldn't load part serials");
        setParts([]);
      })
      .finally(() => {
        if (request === requestRef.current) setLoading(false);
      });
  }, [debouncedPartSearch, open, product.id]);

  const canLink = Boolean(part && parent && part.id !== parent.id);

  async function handleLink() {
    if (!part || !parent) return;
    setSaving(true);
    setError(null);
    try {
      await linkProductUnit(part.id, parent.id);
      await onLinked();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't attach the part");
    } finally {
      setSaving(false);
    }
  }

  const fromThisProduct = parts.filter((u) => u.isSubProduct);
  const otherParts = parts.filter((u) => !u.isSubProduct);

  function renderPartGroup(label: string, list: LinkableUnitOption[]) {
    if (!list.length) return null;
    return (
      <div className="lc-group">
        <span className="lc-group__label">{label}</span>
        {list.map((unit) => (
          <OptionRow
            key={unit.id}
            name="lc-part"
            selected={part?.id === unit.id}
            title={`${unit.productName} · ${unit.serialNumber}`}
            unit={unit}
            onSelect={() => setPart(unit)}
          />
        ))}
      </div>
    );
  }

  return (
    <Modal
      footer={
        <span className="lc-footnote">
          {canLink ? "Ready to attach." : !part ? "Pick a part serial to continue." : `Pick a ${product.name} serial to continue.`}
        </span>
      }
      open={open}
      primaryAction={{ content: "Attach part", disabled: !canLink, loading: saving, onAction: () => void handleLink() }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
      title={`Attach a part to ${product.name}`}
      onClose={onClose}
    >
      <Modal.Section>
        <div className="lc">
          {error ? (
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          ) : null}

          {/* Step 1 */}
          <section className={cn("lc-step", part && "is-done")}>
            <header className="lc-step__head">
              <span className="lc-step__num">{part ? <Icon source={CheckIcon} /> : "1"}</span>
              <div>
                <h3>Part serial</h3>
                <p>A battery, thruster, camera or any serialized part that isn&apos;t attached yet.</p>
              </div>
            </header>

            {part ? (
              <Chosen
                label="Part"
                meta={[part.warehouseName, productUnitStatusLabel(part.status)].filter(Boolean).join(" · ")}
                title={`${part.productName} · ${part.serialNumber}`}
                onChange={() => setPart(null)}
              />
            ) : (
              <>
                <TextField
                  autoComplete="off"
                  autoFocus
                  clearButton
                  label="Search parts"
                  labelHidden
                  placeholder="Search by part name, SKU or serial"
                  prefix={<Icon source={SearchIcon} />}
                  suffix={loading ? <Spinner size="small" /> : undefined}
                  value={partSearch}
                  onChange={setPartSearch}
                  onClearButtonClick={() => setPartSearch("")}
                />
                {parts.length === 0 && !loading ? (
                  <div className="lc-empty">
                    <strong>{debouncedPartSearch ? `No unattached parts match "${debouncedPartSearch}"` : "No unattached part serials"}</strong>
                    <p>Create the part first, then add its serial.</p>
                    <Button size="slim" url={`/dashboard/inventory/products/new?parentId=${product.id}`}>
                      Create a part for {product.name}
                    </Button>
                  </div>
                ) : (
                  <div className={cn("lc-list", loading && "is-loading")} role="radiogroup" aria-label="Part serials">
                    {renderPartGroup(`${product.name} parts`, fromThisProduct)}
                    {renderPartGroup(fromThisProduct.length ? "Other parts" : "Parts", otherParts)}
                  </div>
                )}
                {partsTotal > parts.length ? (
                  <small className="lc-hint">
                    Showing {parts.length} of {partsTotal} — search to narrow it down.
                  </small>
                ) : null}
              </>
            )}
          </section>

          <span className="lc-arrow" aria-hidden>
            <Icon source={ArrowDownIcon} />
          </span>

          {/* Step 2 */}
          <section className={cn("lc-step", parent && !editingParent && "is-done")}>
            <header className="lc-step__head">
              <span className="lc-step__num">{parent && !editingParent ? <Icon source={CheckIcon} /> : "2"}</span>
              <div>
                <h3>{product.name} serial</h3>
                <p>The main unit the part goes on.</p>
              </div>
            </header>

            {parentCandidates.length === 0 ? (
              <div className="lc-empty">
                <strong>No {product.name} serials yet</strong>
                <p>Add a serial for the main unit first, then attach parts to it.</p>
              </div>
            ) : parent && !editingParent ? (
              <Chosen
                label={product.name}
                meta={[parent.warehouseName, productUnitStatusLabel(parent.status)].filter(Boolean).join(" · ")}
                title={parent.serialNumber}
                onChange={() => setEditingParent(true)}
              />
            ) : (
              <>
                {parentCandidates.length > 5 ? (
                  <TextField
                    autoComplete="off"
                    clearButton
                    label="Filter serials"
                    labelHidden
                    placeholder={`Filter ${product.name} serials`}
                    prefix={<Icon source={SearchIcon} />}
                    value={parentSearch}
                    onChange={setParentSearch}
                    onClearButtonClick={() => setParentSearch("")}
                  />
                ) : null}
                {filteredParents.length === 0 ? (
                  <p className="lc-hint">No serials match.</p>
                ) : (
                  <div className="lc-list" role="radiogroup" aria-label={`${product.name} serials`}>
                    {filteredParents.map((unit) => (
                      <OptionRow
                        key={unit.id}
                        name="lc-parent"
                        selected={parentId === unit.id}
                        title={unit.serialNumber}
                        unit={unit}
                        onSelect={() => {
                          setParentId(unit.id);
                          setEditingParent(false);
                        }}
                      />
                    ))}
                  </div>
                )}
                {parent?.status === "sold" ? (
                  <small className="lc-hint">This unit is already sold — the part will follow it to the customer.</small>
                ) : null}
              </>
            )}
          </section>

          {part && parent && !part.isSubProduct ? (
            <p className="lc-hint">
              {part.productName} will also be added to {product.name}&apos;s sub-products in your catalog.
            </p>
          ) : null}
        </div>
      </Modal.Section>
    </Modal>
  );
}
