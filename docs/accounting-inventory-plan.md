# Accounting & Inventory Plan

> **Status:** Draft plan — revenue/payment partially implemented; inventory COGS Phase 1 started  
> **Related:** [currency-option-b-plan.md](./currency-option-b-plan.md)

---

## Current behaviour (today)

| Event | What happens | What does NOT happen |
|-------|----------------|----------------------|
| **Sales order confirmed** | Locks exchange rate; `invoice_status = to_invoice` | No stock deduction; serial stays `in_stock` |
| **Invoice posted** | AR document created; rate locked; SO marked invoiced; **serial units → `sold`** | No GL journal persisted; bulk qty stock not decremented yet; no COGS row |
| **Payment registered** | `invoice_payments` row; `amount_paid` updated; payment state → paid/partial | No inventory impact (correct) |

**Payment is cash collection only.** It must not deduct inventory or post COGS.

---

## Target Odoo-style flow

```
Quotation (draft)
    → Send
    → Confirm sales order     [optional: reserve serial → assigned]
    → Post invoice            [revenue + AR + stock out + COGS]
    → Register payment        [cash/bank + clear AR]
```

### When each accounting piece fires

| Step | Accounts (conceptual) | Inventory |
|------|----------------------|-----------|
| Confirm SO | None (commitment only) | Optional: reserve serial (`assigned`) |
| **Post invoice** | Dr Accounts Receivable · Cr Revenue · Cr VAT | Deduct qty / mark serial `sold` |
| **Post invoice** | Dr COGS · Cr Inventory asset | Uses `products.cost_price` |
| Register payment | Dr Bank/Cash · Cr Accounts Receivable | None |

---

## Implementation phases

### Phase 1 — Invoice post = fulfillment (in progress)

- [x] Mark serial-tracked `product_units` as `sold` on invoice post
- [ ] Decrement `stock_levels` for non-serial storable lines (use `sales_order_lines.warehouse_id`)
- [ ] Block post if serial already sold or insufficient bulk stock
- [ ] Activity log: “Inventory fulfilled on post”

### Phase 2 — COGS on post

- [ ] Read `products.cost_price` per line (native cost currency TBD)
- [ ] Store `cost_amount` / `cost_amount_base` on `invoice_lines` at post time
- [ ] Persist journal items table (or `account_moves`) — replace UI-only Journal tab
- [ ] Journal entry on post:
  - Dr 5000 COGS
  - Cr 1200 Inventory
  - (amount = sum of line costs in base currency)

### Phase 3 — Payment journals

- [ ] Map payment method → bank/cash account
- [ ] Persist payment journal entry on register payment
- [ ] Multi-currency payment conversion (already on `invoice_payments`)

### Phase 4 — Sales order reservation (optional)

- [ ] On SO confirm: serial `in_stock` → `assigned`
- [ ] On invoice post: `assigned` → `sold`
- [ ] On SO cancel: release reservation

---

## Rules (non-negotiable)

1. **Never deduct stock on payment** — only on invoice post (or explicit delivery note).
2. **COGS matches fulfillment** — same event as stock deduction.
3. **Cost is frozen at post** — use `cost_price` at post time, not current catalog cost.
4. **Serial numbers** — one unit per line; status `sold` is irreversible without credit note / return flow.
5. **Reporting** — P&L uses base currency (`amount_*_base`); see currency Option B plan.

---

## User-facing copy

| Screen | Message |
|--------|---------|
| Invoice draft | Confirm & post before payment |
| Payment modal | Payment clears AR; inventory/COGS already handled at post |
| Journal tab (future) | Show entries created at post + payment |

---

## Resolved decisions

1. **Cost currency** — `products.cost_price` uses catalog currency (`price_currency_id`); converted to base at invoice post via exchange rates.
2. **Services** — Skip inventory deduction and COGS for `products.type = service`.
3. **Partial delivery** — Supported: multiple invoices per SO with partial qty; `sales_invoice_status` includes `partial`.
4. **Expenses** — Petty cash via Cash journal + expense accounts (`POST /api/v1/accounting/expenses`).
5. **GL table name** — Chart of accounts stored in `gl_accounts` (avoids conflict with Better Auth `accounts` table).
