# Purchase Order Landed Cost & Margin Preview Plan

> **Status:** Approved for implementation (Phase 1 + 2)  
> **Related:** [accounting-inventory-plan.md](./accounting-inventory-plan.md) (COGS uses `products.cost_price`)

---

## Problem

Today a purchase order total is **lines only** (qty × unit price). There is no place to record freight, delivery, customs, or other vendor charges. On goods receipt, `products.cost_price` is set to the PO line **unit price only** — not true landed cost. The create PO UI shows a simple line sum and has **no margin preview** against catalog sell price. Draft POs can be edited via API but there is **no edit UI**.

---

## Current behaviour (today)

| Step | What happens |
|------|----------------|
| **Create PO** | UI total = Σ(qty × unitPrice); API stores line subtotals/tax; `amount_total` = line totals only |
| **Confirm PO** | Locks exchange rate; state → `confirmed` |
| **Validate goods receipt** | Stock in; `purchase_order_lines.qty_received` updated; **`products.cost_price = po_line.unit_price`** |
| **Sell / invoice** | COGS (when implemented) reads `cost_price` at post time |

**Sales side reference:** quotations/SOs already support `delivery_fee_amount` / `delivery_fee_percent` via `resolveDeliveryFee()` and `sumDocumentAmounts()` in `@frog1/shared`.

---

## Target behaviour

```
Draft PO
  → Enter lines + freight + other charges
  → See total PO cost + margin preview vs sell price
  → Confirm PO
  → Receive goods
  → Allocate charges to lines → update cost_price with landed unit cost
```

### Totals formula (PO currency)

```
line_net     = Σ line.price_subtotal
freight      = resolveDeliveryFee(line_net, freight_amount, freight_percent)
other        = other_charges_amount ?? 0
amount_untaxed = line_net + freight + other
amount_tax   = Σ line.price_tax          (unchanged — tax stays on product lines)
amount_total = amount_untaxed + amount_tax
```

Base currency columns (`amount_*_base`) multiply by locked exchange rate (same as today).

### Landed unit cost (on receipt validate)

Allocate PO-level charges **by line value** across the PO:

```
charge_pool = freight + other
line_share  = line.price_subtotal / line_net
line_charge = charge_pool × line_share
landed_unit = line.unit_price + (line_charge / line.quantity)
```

On validate, set `products.cost_price = landed_unit` (same overwrite behaviour as today, but includes allocated charges).

For **partial receipts**, allocate using the **full PO line_net** (not just this receipt’s lines) so landed cost is stable regardless of receipt batch. Only update `cost_price` for products received in this validation (unchanged scope).

---

## Schema (migration `0027_purchase_order_charges.sql`)

Add to `purchase_orders`:

| Column | Type | Notes |
|--------|------|-------|
| `freight_amount` | numeric(18,2) nullable | Flat freight; mutually exclusive with percent |
| `freight_percent` | numeric(8,4) nullable | % of line_net |
| `other_charges_amount` | numeric(18,2) not null default 0 | Customs, handling, insurance, etc. |

No line-level charge columns in Phase 1/2 (PO-level allocation only).

**Files:** `packages/db/src/schema/purchasing.ts`, export from `packages/db`, run via `AUTO_MIGRATE=true` or `pnpm db:migrate`.

---

## Implementation phases

### Phase 1 — PO charges, totals, margin preview, draft edit UI

**Goal:** Buyer sees true PO cost and margin before confirming; can edit draft POs in the app.

#### 1.1 Database & shared totals

- [ ] Migration `0027_purchase_order_charges.sql`
- [ ] Extend `purchaseOrders` schema with freight + other charge fields
- [ ] Update `purchase-orders.service.ts` → `recomputeOrderTotals()`:
  - Load freight/other from order row
  - Call `sumDocumentAmounts(lines, rate, freightAmount, freightPercent)`
  - Add `otherChargesAmount` to `amountUntaxed` and `amountTotal` (and base columns)
- [ ] Extend `CreatePurchaseOrderInput` / `UpdatePurchaseOrderInput` with charge fields
- [ ] Validate: freight amount and percent not both set (mirror quotations `resolveDeliveryFeeFields`)

#### 1.2 API responses & documents

- [ ] Include charge fields on `getById` / list responses
- [ ] PO PDF/email preview: show freight, other charges, and total breakdown (reuse document renderer pattern from quotations)

#### 1.3 Web — create PO

- [ ] Add freight mode control (none / amount / percent) — reuse pattern from `create-quotation-page.tsx`
- [ ] Add **Other charges** flat amount field
- [ ] Sidebar / summary card:
  - Line subtotal
  - Freight (if any)
  - Other charges (if any)
  - **Total PO cost** (`amount_total` preview client-side)
- [ ] **Margin preview** table (Products tab or sidebar):
  - Per line: unit cost, est. landed unit cost (proportional charge allocation), catalog `selling_price`, margin % = `(sell - landed) / sell`
  - PO total row: total cost vs total sell value, blended margin %
  - Show “—” when product has no sell price
  - Optional: **target margin %** input → suggest max unit price per line (informational only)
- [ ] Send charge fields in `createPurchaseOrder` payload

#### 1.4 Web — edit draft PO

- [ ] Route: `/dashboard/purchasing/orders/[id]/edit` (draft only; redirect if confirmed)
- [ ] Refactor shared form: extract `PurchaseOrderForm` from create page (header, lines, charges, totals, margin)
- [ ] Load existing order + lines; `updatePurchaseOrder`, `addPurchaseOrderLine`, `updatePurchaseOrderLine`, `removePurchaseOrderLine`
- [ ] “Edit” button on `purchase-order-view-page.tsx` when `state === 'draft'`

#### 1.5 Web types & client

- [ ] Extend `PurchaseOrder` type and `purchase-orders-api.ts` create/update payloads

**Phase 1 acceptance criteria**

- Draft PO with freight $100 + other $50 on $1000 line net → total untaxed $1150 (+ tax)
- Margin preview updates live when lines or charges change
- Draft edit persists charges and lines; confirmed PO charges are read-only on view page

---

### Phase 2 — Landed cost on goods receipt

**Goal:** Inventory cost reflects freight and other PO charges.

#### 2.1 Allocation helper

- [x] Add `allocatePoCharges(order, lines)` in API (or `@frog1/shared` if reused):
  - Input: line_net, freight, other, lines with `priceSubtotal`, `unitPrice`, `quantity`
  - Output: `landedUnitCost` per line id

#### 2.2 Receipt validate

- [x] In `validateReceipt()` (~line 1028), replace `costPrice: poLine.unitPrice` with `costPrice: landedUnitCost`
- [x] Activity log note: “Cost updated to landed unit cost (incl. freight/charges)”

#### 2.3 View UI

- [x] PO detail: show **Landed cost** column on lines (computed, not stored) when charges > 0
- [x] Goods receipt confirmation: optional summary of cost impact per product

**Phase 2 acceptance criteria**

- PO: 2 lines $600 + $400, freight $100 → line1 landed +$60/unit share, line2 +$40/unit share
- After validate, `products.cost_price` matches landed unit (not raw PO unit price)
- PO with zero charges behaves exactly as today

---

### Phase 3 — Later (out of scope for MVP)

- [ ] Vendor bill / 3-way match (PO ↔ receipt ↔ bill)
- [ ] Charge lines by qty or weight (not only by value)
- [ ] Store `landed_unit_cost` on `purchase_order_lines` at confirm time for audit
- [ ] Weighted average cost across receipts instead of last-receipt overwrite
- [ ] GL: Dr inventory asset on receipt at landed value (when inventory accounting is built)

---

## File touch list

| Area | Files |
|------|--------|
| Schema | `packages/db/src/schema/purchasing.ts`, `drizzle/0027_purchase_order_charges.sql` |
| Shared | `packages/shared/src/currency/money.ts` (optional: `addOtherCharges()` helper) |
| API | `apps/api/src/purchase-orders/purchase-orders.service.ts`, `purchase-orders.controller.ts` |
| Documents | `apps/api/src/documents/document-renderer.service.ts` (PO template totals) |
| Web API | `apps/web/src/lib/purchase-orders-api.ts`, `apps/web/src/lib/line-item-utils.ts` |
| Web UI | `create-purchase-order-page.tsx`, new `edit-purchase-order-page.tsx`, `purchase-order-view-page.tsx`, `purchase-order-context-card.tsx`, new `purchase-order-margin-preview.tsx`, `purchase-order-charges-form.tsx` |
| Routes | `apps/web/src/app/dashboard/purchasing/orders/[id]/edit/page.tsx` |

---

## UI mock (summary card)

```
Line subtotal          $1,000.00
Freight                +  100.00
Other charges          +   50.00
Tax                    +  150.00   (if applicable)
─────────────────────────────────
Total PO cost          $1,300.00

Margin preview
  Line A  landed $10.50  sell $15.00  → 30.0%
  Line B  landed $21.00  sell $25.00  → 16.0%
  Blended margin         → 22.4%
```

---

## Rules (non-negotiable)

1. **Charges editable only in draft** — confirmed POs show charges read-only; changes require cancel + new PO (existing pattern).
2. **Freight amount XOR percent** — same rule as sales delivery fee.
3. **Landed cost on receipt only** — do not change `cost_price` on PO confirm (stock not in yet).
4. **Allocation by line value** — default method unless Phase 3 adds alternatives.
5. **Margin preview is advisory** — uses catalog `selling_price`; does not change SO/quotation pricing.

---

## Test plan

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Create PO, freight 10% on $500 lines | `amount_untaxed` = $550 (+ other $0) |
| 2 | Create PO, freight $75 + other $25 | Total untaxed = line_net + $100 |
| 3 | Margin preview, sell price missing | Shows “—”, no error |
| 4 | Edit draft: change freight, add line | Totals and margin refresh; API persists |
| 5 | Confirm PO → validate receipt with charges | `cost_price` = landed unit, not raw unit |
| 6 | PO with no charges | Identical to current behaviour |
| 7 | Partial receipt (2 of 10 units) | `cost_price` updated; allocation still uses full PO line_net |

---

## Suggested implementation order

1. Migration + schema + `recomputeOrderTotals` (API only, verify with existing tests or curl)
2. Create PO charge fields + total breakdown (web)
3. Margin preview component
4. Edit draft PO page
5. Landed cost in `validateReceipt`
6. PO view landed column + document PDF totals

Estimated effort: **Phase 1 ~1–2 days**, **Phase 2 ~0.5 day**.
