# Currency Architecture — Option B Implementation Plan

> **Status:** Phases 0–7 implemented; Phase 8 partial (core + payment tests)  
> **Target:** Multi-currency ERP (Odoo-style)  
> **Scope:** `frog1/` (NestJS API + Next.js web + Drizzle DB)

---

## Summary

Each **document** (quotation, sales order, invoice, payment) stores amounts in its **own currency**. The organization has a **base currency** for reporting only. Every document also stores `exchange_rate` (document → base) and `amount_*_base` columns so KPIs and dashboards can sum correctly.

**Changing base currency in Settings does not rewrite historical documents.** It only affects how new base totals are computed and how reporting is labeled.

The DB schema already supports this on `sales_orders` and `invoices`. The work is **enforcement**: one set of rules applied everywhere, with no symbol-only paths.

---

## The Five Rules (Non-Negotiable)

| # | Rule | Why |
|---|------|-----|
| 1 | **Document amounts = document currency** | A quote in AED shows AED 634, not $634 with an AED symbol |
| 2 | **Every document stores `exchange_rate` + `amount_*_base`** | Locked at confirm/post; reporting never guesses |
| 3 | **KPIs and dashboards sum `amount_*_base` only** | Never sum `amountTotal` across mixed currencies |
| 4 | **Changing currency on a document always converts amounts** | No optional checkbox, no symbol-only save |
| 5 | **Missing exchange rate = hard error** | Never silently use rate `1` |

---

## Currency Roles

| Role | Storage | Purpose |
|------|---------|---------|
| **Base currency** | `organizations.base_currency_id` | Company reporting currency; exchange rates convert **into** base |
| **Catalog currency** | `organizations.metadata.catalogCurrencyId` | Default currency for new products |
| **Product price currency** | `products.price_currency_id` | Per-product override (e.g. USD pricing) |
| **Document currency** | `sales_orders.currency_id`, `invoices.currency_id` | Customer-facing currency on that quote/invoice |
| **Exchange rates** | `exchange_rates` table | Configured as foreign → base (e.g. `1 USD = 3.67 AED`) |

### What base currency is NOT

- A global display toggle that relabels all numbers
- A trigger to multiply every stored amount in the database

### What base currency IS

- The denominator for pipeline totals, P&L, alerts, and dashboard KPIs
- The target for `amount_*_base` columns on every financial document

---

## Architecture

```
Product catalog     → native price + priceCurrencyId     ($200 USD)
Document            → customer-facing currency             (AED 634 on quote)
Base                → reporting normalization                (amount_total_base)
```

```
┌─────────────────┐     add line (convert once)     ┌──────────────────┐
│ Product         │ ──────────────────────────────► │ Document lines   │
│ $200 USD        │                                 │ AED 634          │
└─────────────────┘                                 └────────┬─────────┘
                                                               │
                                                    save / confirm
                                                               ▼
                                                      ┌──────────────────┐
                                                      │ amount_*_base    │
                                                      │ (for KPIs)       │
                                                      └──────────────────┘
```

### Display rules

| Screen | Show |
|--------|------|
| Product list / product view | Native product currency |
| Quotation / invoice document | Document currency |
| Pipeline KPIs / dashboard / alerts | Base currency (from `amount_*_base`) |

---

## Current State vs Target

### Already in schema

- `sales_orders`: `currency_id`, `exchange_rate`, `exchange_rate_locked_at`, `amount_*_base`
- `invoices`: same pattern
- `invoice_payments`: `currency_id`, `exchange_rate`
- `exchange_rates`: org-scoped pairs with effective dates
- `quotations.service.ts`: `convertQuotationCurrency`, `resolveExchangeRate`, `sumDocumentAmounts`

### Known gaps

| Area | Problem |
|------|---------|
| `formatOrgMoney` | Formats with base symbol; does not convert — used on invoices, KPIs, payments |
| Quotation builder | Optional “Convert line amounts” checkbox allows symbol-only save |
| Create quotation | Missing rate updates currency ref but skips conversion |
| `getLatestRate()` | Returns `1` silently when no rate exists |
| Invoice frontend | No `currencyId` on types; all views use `formatOrgMoney` |
| Invoice API | Schema exists; no full `invoices.service.ts` mirroring quotations |
| KPIs | Sum raw `amountTotal` across mixed currencies |
| Conversion logic | Duplicated across hook, create pages, and server |

### Key files

| Concern | Path |
|---------|------|
| Settings UI | `apps/web/src/app/dashboard/settings/currencies/page.tsx` |
| Org currency hook | `apps/web/src/hooks/use-org-currency.ts` |
| Product → document hook | `apps/web/src/hooks/use-product-document-currency.ts` |
| Conversion helpers | `apps/web/src/lib/product-currency.ts`, `currency-utils.ts` |
| Exchange rate API | `apps/api/src/currencies/exchange-rates.service.ts` |
| Quotation server logic | `apps/api/src/sales/quotations.service.ts` |
| Sales calculations | `apps/api/src/sales/sales-calculations.ts` |
| DB schema | `packages/db/src/schema/sales.ts`, `currencies.ts` |
| Legacy design doc | `docs/currency-conversion.md` |

---

## Phase 0 — Shared Currency Module

**Goal:** One source of truth. No duplicated conversion logic.

**Effort:** 1–2 days

### Tasks

- [ ] Create canonical currency service (API + shared):
  - `getRate(orgId, fromCurrencyId, toCurrencyId)` — lookup direct/inverse; **throw** if missing
  - `hasRate(orgId, from, to)` — explicit check before conversion
  - `convert(amount, rate)` — rounded multiply
  - `resolveDocumentToBaseRate(orgId, documentCurrencyId)` — document → base
  - `formatMoney(amount, currency)` — display only, no conversion
- [ ] Remove silent fallback: `getLatestRate()` must not return `1` without a configured rate in conversion paths
- [ ] Consolidate frontend duplicates:
  - `create-quotation-page.tsx` inline conversion → shared hook only
  - `create-invoice-page.tsx` → same hook, target document currency
- [ ] Ban `formatOrgMoney(documentAmount)` — replace with document-aware formatter
- [ ] Update `docs/currency-conversion.md` to reference this plan

### Suggested location

```
packages/shared/src/currency/     # types + pure functions
apps/api/src/currencies/          # DB-backed service wrapping exchange_rates
apps/web/src/lib/currency-utils.ts # thin re-exports / API client wrappers
```

### Acceptance criteria

- Single `convertAmount` + `getRate` used by API and web
- Missing rate throws a clear error everywhere
- No new code uses `formatOrgMoney` on document amounts

---

## Phase 1 — Quotations (Reference Implementation)

**Goal:** Quotations become the gold standard every other module copies.

**Effort:** 2–3 days

### Backend (`apps/api/src/sales/quotations.service.ts`)

- [ ] On create/update when `currencyId` changes: **always** call `convertQuotationCurrency`
- [ ] Remove `convertCurrency: false` opt-out path
- [ ] On confirm order: lock `exchange_rate` + `exchange_rate_locked_at`
- [ ] Confirmed documents use locked rate, not live rate from settings
- [ ] `resolveExchangeRate`: throw if rate missing (no fallback to `1`)
- [ ] List/detail API responses include: `currencyId`, `currencyCode`, `exchangeRate`, `amountTotal`, `amountTotalBase`

### Frontend

- [ ] `quotation-builder-page.tsx`: remove optional “Convert line amounts” checkbox — conversion automatic or blocked
- [ ] Remove manual “Convert line amounts” repair card after data cleanup (Phase 7)
- [ ] Row display: `formatMoney(amountTotal, quotation.currencyId)` (partially done)
- [ ] Pipeline KPI in `quotations-list.tsx`: `sum(amountTotalBase)` + base currency label
- [ ] `create-quotation-page.tsx`: on missing rate, **revert** currency dropdown; do not advance state with wrong numbers
- [ ] All product → document conversion via `useProductDocumentCurrency` only

### Acceptance criteria

- Create AED quote from USD products → lines show converted amounts
- Change quote currency USD → AED → all lines multiply; persisted on save
- Missing rate → error, no save, currency unchanged
- Confirm quote → rate locked
- Pipeline KPI correct when mixing USD and AED quotes (uses base columns)

---

## Phase 2 — Invoices

**Goal:** Wire invoices end-to-end with same rules as quotations.

**Effort:** 3–5 days

### Policy decision (pick one for v1)

**Implemented: Option A** — Invoice currency = sales order currency. Standalone invoices use an explicit `currencyId` (defaults to org base currency on the create page).

### Backend (new `apps/api/src/invoices/invoices.service.ts`)

- [ ] CRUD mirroring quotations pattern
- [ ] `currencyId`, `exchangeRate`, line amounts in document currency
- [ ] Recompute `amount_*_base` on every total update
- [ ] Lock rate on **post** (not draft)
- [ ] Invoice from sales order: inherit order currency + amounts

### Frontend

- [ ] Add to `apps/web/src/lib/invoices-api.ts`: `currencyId`, `currencyCode`, `exchangeRate`, `amountTotalBase`
- [ ] `invoices-list.tsx`, `invoice-view-page.tsx`: show document currency per row/document
- [ ] KPI cards: sum `amountTotalBase`, label with base currency
- [ ] `create-invoice-page.tsx`: convert to **document currency** (not hardcoded base)
- [ ] `payments-list.tsx`, `credit-notes-list.tsx`: document/payment currency aware

### Acceptance criteria

- Invoice created from confirmed order matches order currency and amounts
- Posted invoice rate locked
- Invoice list KPIs use base columns
- No screen uses `formatOrgMoney` on invoice line/total amounts

---

## Phase 3 — Products & Catalog

**Goal:** Clarify product pricing vs document pricing (no global conversion on product list).

**Effort:** 1 day

### Tasks

- [ ] Product list/view: always show native `priceCurrencyId` (keep current behavior)
- [ ] On add to document: product currency → document currency (via shared hook)
- [ ] Settings labels: distinguish “Catalog/pricing currency” from “Base/reporting currency”
- [ ] Replace inferred `defaultPricingCurrency` magic in `use-org-currency.ts` with explicit setting

### Acceptance criteria

- Product catalog shows USD; quotation line shows AED after add
- No confusion in Settings UI between catalog and base currency

---

## Phase 4 — Reporting & Aggregates

**Goal:** Stop lying totals on dashboards and KPIs.

**Effort:** 2 days

### Screens to fix

| Screen | Today (wrong) | Fix |
|--------|----------------|-----|
| `quotations-list.tsx` pipeline KPI | `sum(amountTotal)` + `formatOrgMoney` | `sum(amountTotalBase)` + base formatter |
| `sales-orders-list.tsx` KPIs | same | same |
| `dashboard/page.tsx` | same | same |
| `alerts.service.ts` | mixed outstanding amounts | use base columns or convert |
| Email templates in quotations | `formatOrgMoney` on quote total | document currency formatter |

### Optional API

- [ ] `GET /reports/sales-summary` — pre-aggregated base totals for dashboard

### Acceptance criteria

- Pipeline with USD + AED + SGD documents shows one correct base total
- No frontend code sums raw `amountTotal` across documents

---

## Phase 5 — Payments & Credit Notes

**Goal:** Multi-currency payment registration (standard ERP behavior).

**Effort:** 2–3 days

### Rules

- Payment may be in **payment currency** ≠ invoice currency
- Store: payment amount in payment currency, `amount_base`, rate used at registration
- Invoice `amount_paid` stays in **invoice currency** (convert payment on register)
- UI shows both: e.g. “Paid USD 500 (= AED 1,835.50 on invoice)”

### Tasks

- [ ] Payment register API: accept payment currency + amount; convert to invoice currency for `amount_paid`
- [ ] Store locked rate on payment row
- [ ] Credit notes: same document currency pattern as invoices

### Acceptance criteria

- Register USD payment against AED invoice → invoice paid amount updated correctly in AED
- Payment list shows payment currency; receivables KPI uses base

---

## Phase 6 — Exchange Rate Management

**Goal:** Predictable rate lookup and no retroactive changes.

**Effort:** 1 day

### Tasks

- [ ] UI: rates as **foreign → base** only (already mostly true)
- [ ] Document cross-rate policy: compute via base as hub, or require direct pairs
- [ ] Rate effective dates: use latest rate on or before document date when locking
- [ ] Changing rate in Settings does **not** change confirmed/posted documents

### Acceptance criteria

- Rate change in Settings affects new drafts only
- Confirmed quotation from last month keeps its locked rate

---

## Phase 7 — Data Cleanup

**Goal:** Fix documents corrupted by symbol-only currency changes.

**Effort:** 1 day

### Tasks

- [ ] Migration script: flag documents where currency and numeric amounts are inconsistent
- [ ] Admin action: “Reconvert document” from selected source currency using saved rate
- [ ] Remove repair UI from quotation builder once data is clean

### Acceptance criteria

- No production documents with AED label on USD numeric values (or flagged for manual review)

---

## Phase 8 — Tests

**Goal:** Gate each phase with automated coverage.

**Effort:** Ongoing; minimum set before Phase 2 complete

### Test matrix

| Scenario | Expected |
|----------|----------|
| USD product → AED quote | Line unit price = 200 × rate |
| Change quote USD → AED | All lines multiply; save persists |
| Missing rate on currency change | Error; no save; currency unchanged |
| Confirm quote | `exchange_rate` locked |
| Pipeline with USD + AED quotes | KPI = sum of `amount_total_base` |
| Invoice from confirmed order | Same currency and amounts |
| Payment in USD on AED invoice | Invoice paid amount in AED |
| Change org base currency | Old docs unchanged; new docs use new base rate |
| Posted invoice after rate change in Settings | Amounts unchanged |

### Suggested locations

```
apps/api/src/currencies/exchange-rates.service.spec.ts
apps/api/src/sales/quotations.service.spec.ts
apps/api/src/sales/sales-calculations.spec.ts
```

---

## Build Order

```
Phase 0  Shared currency service
   ↓
Phase 1  Quotations (reference implementation)
   ↓
Phase 2  Invoices
   ↓
Phase 4  KPIs / dashboard (quick win)
   ↓
Phase 3  Product / catalog clarity
   ↓
Phase 5  Payments
   ↓
Phase 6  Rate policy hardening
   ↓
Phase 7  Data cleanup
   ↓
Phase 8  Tests (parallel with each phase)
```

**First sprint recommendation:** Phase 0 + Phase 1 + Phase 4 (pipeline KPI fix).

---

## Stop Doing (Checklist for PR Review)

- [ ] Using `formatOrgMoney` on any amount tied to a specific document
- [ ] Treating base currency change as “convert the whole system”
- [ ] Optional conversion checkboxes on currency change
- [ ] Client-side-only conversion without server validation
- [ ] Summing `amountTotal` across documents in KPIs
- [ ] Silent `rate = 1` when exchange rate is missing

---

## Definition of Done (Whole Initiative)

- [ ] Customer quote in SGD → every line and total in SGD on that document forever
- [ ] Dashboard pipeline in base currency → correct sum regardless of quote currencies
- [ ] Product catalog stays in native currency → converts only when added to a document
- [ ] Changing base currency in Settings → reporting updates; historical documents unchanged
- [ ] No screen shows symbol swap without math
- [ ] All five non-negotiable rules enforced in API and web

---

## Related Docs

- Current behavior notes: `docs/currency-conversion.md` (update when phases complete)
- DB schema: `packages/db/src/schema/sales.ts`, `packages/db/src/schema/currencies.ts`
