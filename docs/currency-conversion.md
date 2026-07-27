# Currency conversion logic

> **See also:** [Currency Architecture — Option B Implementation Plan](./currency-option-b-plan.md) for the full multi-currency roadmap and enforcement rules.

This document describes how product prices are stored, displayed, and converted across the app.

## Core rules

1. **Product catalog prices are stored as a number + currency** (`sellingPrice`, `costPrice`, `priceCurrencyId`).
2. **Quotations and invoices have a document currency** (e.g. AED for a Dubai customer).
3. **When document currency ≠ product price currency**, amounts are multiplied by the saved exchange rate — never just relabelled.
4. **Exchange rates** are configured under **Settings → Company** (e.g. `1 USD = 3.17 AED`).

### Example

| Step | Value |
|------|-------|
| Product in catalog | **$200 USD** |
| Quotation currency | **AED** |
| Exchange rate | 3.17 |
| Line unit price on quote | **AED 634.00** (200 × 3.17) |
| After -5% non-local adjustment | **AED 602.30** |

**Wrong:** $200 → AED 200 (symbol swap only).

## Currency roles

| Setting | Purpose |
|---------|---------|
| **Base currency** | Company reporting currency (e.g. AED). Exchange rates convert **into** base. |
| **Product catalog currency** | Default currency for new products (company setting). |
| **Product price currency** | Per-product override (`priceCurrencyId`). |
| **Default pricing currency** | Inferred from exchange rates (usually USD when `1 USD = X AED` is saved). Used when a product has no `priceCurrencyId`. |
| **Document currency** | Quotation or invoice currency selected for the customer. |

## Resolution order for a product price

```
product.priceCurrencyId
  ?? defaultPricingCurrencyId   (USD from exchange rates, if configured)
  ?? catalogCurrencyId
  ?? baseCurrencyId
```

## Conversion formula

```
documentAmount = catalogAmount × exchangeRate(from: productCurrency, to: documentCurrency)
```

Implemented in `apps/web/src/lib/product-currency.ts` and `apps/web/src/hooks/use-product-document-currency.ts`.

## Where conversion applies

| Screen | Product list shows | Line amounts on document |
|--------|-------------------|--------------------------|
| Products list | Native product currency ($200) | N/A |
| Create quotation | Converted preview (AED 634) | Converted on add |
| Quotation builder (add line modal) | Converted preview | Converted on add |
| Create invoice | Converted preview | Converted on add (to base currency) |
| Edit line modal | N/A | Document currency formatting |

## Shared hook

Use `useProductDocumentCurrency(documentCurrencyId, products, selectedProduct?)` for:

- `formatProductCatalogPrice(product)` — catalog list in document currency
- `convertProductForDocument(product)` — returns `{ unitPrice, unitCost, rate }`
- `fmt(amount)` — format any amount in document currency
- `pricePrefix` — input prefix for document currency

## Setup checklist

1. **Settings → Company** → Base currency = AED (or your reporting currency)
2. **Settings → Company** → Product catalog currency = USD (if you price in dollars)
3. **Settings → Company** → Exchange rate: `1 USD = 3.17 AED`
4. **Products** → each product shows **Price currency = USD** and selling price `200`
5. **Quotation / Invoice** → document currency = AED → lines convert automatically

## Files

| File | Role |
|------|------|
| `packages/shared/src/currency/` | Canonical `roundMoney`, `convertAmount`, `sumDocumentAmounts`, `requireRate` |
| `lib/product-currency.ts` | `resolveProductCurrencyId`, `fetchConversionRate`, `convertProductAmount` |
| `lib/currency-utils.ts` | Re-exports shared conversion helpers; `formatCurrencyAmount` and display utilities |
| `hooks/use-org-currency.ts` | Base/catalog/default pricing currency from company settings |
| `hooks/use-product-document-currency.ts` | Document-level conversion for quotations/invoices |
