import type { CompanyProfileSettings } from "../schemas/company-settings";
import { resolveCompanyProfile } from "../schemas/company-settings";
import type { DocumentTemplateSettings } from "../schemas/document-templates";
import { resolveDocumentTemplates } from "../schemas/document-templates";
import { formatQuantity } from "../format-quantity";
import { formatCountryLabel } from "../locations";
import {
  type DocumentBankAccount,
  renderDocumentPaymentDetailsHtml,
} from "./document-payment-details";
import { renderLineItemDescriptionHtml } from "./line-item-details";

export type { DocumentBankAccount } from "./document-payment-details";

export interface QuotationDocumentLine {
  description: string;
  details?: string | null;
  serialNumber?: string | null;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRatePercent: string;
  priceSubtotal: string;
}

export interface QuotationDocumentChargeLine {
  name: string;
  amount: string;
  scopeLabel?: string | null;
}

export interface QuotationDocumentData {
  documentType?: "quotation" | "invoice" | "purchase_order" | "credit_note";
  number: string;
  quoteDate: string;
  validityDate: string | null;
  paymentReference: string | null;
  customerReference: string | null;
  customerName: string;
  customerEmail: string | null;
  customerTaxId: string | null;
  customerAddress: string[];
  notes: string | null;
  lineNetSubtotal?: string | null;
  deliveryFee?: string | null;
  deliveryFeePercent?: string | null;
  otherCharges?: string | null;
  additionalChargeLines?: QuotationDocumentChargeLine[];
  amountUntaxed: string;
  amountTax: string;
  amountTotal: string;
  currencyCode: string;
  currencySymbol: string;
  decimalPlaces: number;
  lines: QuotationDocumentLine[];
  accessToken?: string | null;
  signedBy?: string | null;
  signedOn?: string | null;
  signatureImage?: string | null;
  signedIp?: string | null;
}

export interface OrganizationBranding {
  name: string;
  logoUrl: string | null;
  stampUrl?: string | null;
  companyProfile: Required<CompanyProfileSettings>;
  documentTemplates: Required<DocumentTemplateSettings>;
  documentBankAccounts?: DocumentBankAccount[];
}

export function formatDocumentMoney(
  value: string | number,
  symbol: string,
  decimalPlaces: number,
): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return `${symbol}0.00`;
  }

  return `${symbol}${amount.toFixed(decimalPlaces)}`;
}

export function formatDocumentDate(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const iso = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    return value;
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function formatTrnLabel(taxId: string | null | undefined): string | undefined {
  if (!taxId?.trim()) {
    return undefined;
  }

  const cleaned = taxId.replace(/^(trn\s*:?\s*)+/i, "").trim();
  return cleaned ? `TRN: ${cleaned}` : undefined;
}

export function formatVatLabel(
  lines: Array<{ taxRatePercent?: string | number | null }>,
): string {
  const rates = lines
    .map((line) => Number(line.taxRatePercent))
    .filter((rate) => Number.isFinite(rate));
  const taxedRates = [...new Set(rates.filter((rate) => rate > 0))];

  if (taxedRates.length !== 1) {
    return "VAT";
  }

  const pretty = String(Number.parseFloat(taxedRates[0].toFixed(2)));
  return `VAT (${pretty}%)`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderQuotationDocumentHtml(
  branding: OrganizationBranding,
  quotation: QuotationDocumentData,
): string {
  const profile = resolveCompanyProfile(branding.companyProfile);
  const templates = resolveDocumentTemplates(branding.documentTemplates);
  const styleClass = `style-${templates.documentStyle}`;
  const isInvoice = quotation.documentType === "invoice";
  const isPurchaseOrder = quotation.documentType === "purchase_order";
  const isCreditNote = quotation.documentType === "credit_note";
  const title = isCreditNote ? "Credit Note" : isInvoice ? templates.invoiceTitle : isPurchaseOrder ? "Purchase Order" : templates.quotationTitle;
  const showPaymentDetails = isInvoice;
  const country = formatCountryLabel(profile.country);
  const addressLine = [profile.address, profile.city, country]
    .filter(Boolean)
    .join(", ");
  const quoteDateLabel = formatDocumentDate(quotation.quoteDate);
  const validityDateLabel = formatDocumentDate(quotation.validityDate);
  const vatLabel = formatVatLabel(quotation.lines);
  const trnLabel = formatTrnLabel(profile.taxId);

  const paymentDetailsHtml = showPaymentDetails
    ? renderDocumentPaymentDetailsHtml({
        companyName: branding.name,
        documentTemplates: templates,
        documentBankAccounts: branding.documentBankAccounts,
        className: "terms",
      })
    : "";

  const lineRows = quotation.lines
    .map(
      (line, index) => `
      <tr>
        <td class="sn" style="text-align: center; font-weight: bold;">${index + 1}</td>
        <td>${renderLineItemDescriptionHtml(line.description, line.details, templates.lineItemDetailsLayout)}</td>
        <td class="num">${escapeHtml(formatQuantity(line.quantity))}</td>
        <td class="num">${formatDocumentMoney(line.unitPrice, quotation.currencySymbol, quotation.decimalPlaces)}</td>
        <td class="num">${escapeHtml(line.discountPercent)}%</td>
        <td class="num">${escapeHtml(line.taxRatePercent)}%</td>
        <td class="num">${formatDocumentMoney(line.priceSubtotal, quotation.currencySymbol, quotation.decimalPlaces)}</td>
      </tr>`,
    )
    .join("");

  const logoHtml = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.name)}" class="logo" />`
    : `<div class="logo-fallback">${escapeHtml(branding.name.charAt(0).toUpperCase())}</div>`;

  if (templates.documentStyle === "official_blue") {
    const money = (value: string | number) => {
      const amount = Number(value);
      return `${escapeHtml(quotation.currencyCode)} ${Number.isFinite(amount) ? amount.toLocaleString("en-US", {
        minimumFractionDigits: quotation.decimalPlaces,
        maximumFractionDigits: quotation.decimalPlaces,
      }) : "0.00"}`;
    };
    const officialRows = quotation.lines.map((line, index) => `
      <tr>
        <td class="sn" style="text-align: center; font-weight: bold;">${index + 1}</td>
        <td>${renderLineItemDescriptionHtml(line.description, line.details, templates.lineItemDetailsLayout)}</td>
        <td class="num">${escapeHtml(formatQuantity(line.quantity))}</td>
        <td class="num">${money(line.unitPrice)}</td>
        <td class="num">${money(line.priceSubtotal)}</td>
      </tr>`).join("");
    const notes = (quotation.notes || [
      templates.defaultPaymentTerms && `Payment terms: ${templates.defaultPaymentTerms}`,
      templates.defaultWarrantyNotes && `Warranty: ${templates.defaultWarrantyNotes}`,
      templates.defaultDeliveryTerms && `Delivery: ${templates.defaultDeliveryTerms}`,
    ].filter(Boolean).join("\n"))
      .replace(/^(Payment terms:\s*)Payment terms:\s*/gim, "$1")
      .replace(/^(Warranty:\s*)Warranty:\s*/gim, "$1")
      .replace(/^(Delivery:\s*)Delivery:\s*/gim, "$1");
    const companyLines = [
      profile.address,
      [profile.city, country].filter(Boolean).join(", "),
      trnLabel,
      profile.phone && `Phone: ${profile.phone}`,
      profile.email && `Email: ${profile.email}`,
      profile.website && `Website: ${profile.website}`,
    ].filter((line): line is string => Boolean(line));
    const customerLines = quotation.customerAddress.length
      ? quotation.customerAddress
      : ["No billing address provided"];
    const subTotalValue = quotation.lineNetSubtotal ?? quotation.amountUntaxed;
    const deliveryFeeLabel = quotation.deliveryFeePercent
      ? `${isPurchaseOrder ? "Freight" : "Delivery fee"} (${quotation.deliveryFeePercent}%)`
      : isPurchaseOrder
        ? "Freight"
        : "Delivery fee";
    const deliveryFeeRow = quotation.deliveryFee
      ? `<div class="row"><span>${escapeHtml(deliveryFeeLabel)}</span><span>${money(quotation.deliveryFee)}</span></div>`
      : "";
    const otherChargesRow =
      !isPurchaseOrder && quotation.additionalChargeLines?.length
        ? quotation.additionalChargeLines
            .map(
              (charge) => `<div class="row"><span>${escapeHtml(charge.name)}${charge.scopeLabel ? ` <span class="charge-scope">(${escapeHtml(charge.scopeLabel)})</span>` : ""}</span><span>${money(charge.amount)}</span></div>`,
            )
            .join("")
        : !isPurchaseOrder && quotation.otherCharges
          ? `<div class="row"><span>Other charges</span><span>${money(quotation.otherCharges)}</span></div>`
          : "";

    const officialLogo = branding.logoUrl
      ? `<img class="brand-logo" src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.name)}" />`
      : `<div class="brand-fallback">${escapeHtml(branding.name.charAt(0).toUpperCase())}</div>`;

    const vatAmountNum = Number(quotation.amountTax ?? 0);
    const hasVat = Number.isFinite(vatAmountNum) && vatAmountNum > 0;
    const officialVatRow = hasVat
      ? `<div class="row"><span>${escapeHtml(vatLabel)}</span><span>${money(quotation.amountTax)}</span></div>`
      : "";
    const officialGrandLabel = hasVat
      ? "Total Amount (Incl. VAT)"
      : "Total Amount";

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<title>${escapeHtml(title)} ${escapeHtml(quotation.number)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:20px 24px;font:11.5px Arial,Helvetica,sans-serif;color:#202735;background:#fff;border-top:6px solid #1d2d62}
.top{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:20px;align-items:center;margin-bottom:4px}
.brand-logo{display:block;width:auto;height:95px;max-width:210px;object-fit:contain;object-position:left center}
.brand-fallback{width:95px;height:95px;background:#1d2d62;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:32px}
.doc-title{text-align:right;color:#17275b;font-size:24px;line-height:1.1;margin:0 0 8px;letter-spacing:.01em}
.meta{display:grid;grid-template-columns:1.05fr .95fr;border:1px solid #3568a9;overflow:hidden}
.meta span,.meta b{padding:6px 9px;font-size:11.5px}
.meta span{color:#fff;background:#3568a9;border-bottom:1px solid #fff}
.meta b{text-align:right;font-weight:600;border-bottom:1px solid #d7e3f2;background:#fff}
.meta span:nth-last-child(2),.meta b:last-child{border-bottom:0}
.company{margin:10px 0 12px;line-height:1.4}
.company strong{display:block;color:#17275b;margin-bottom:4px;font-size:12.5px}
.company p{margin:2px 0}
.addresses{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:0 0 6px}
.address-title{font-weight:700;margin:0 0 4px;color:#17275b}
.address-box{min-height:76px;padding:8px 10px;border:1px solid #b9c5d8;background:#fbfcfe}
.address-box p{margin:2px 0}
table{width:100%;border-collapse:collapse;table-layout:fixed;margin:12px 0 10px}
col.col-sn{width:90px} col.col-qty{width:52px} col.col-price,col.col-total{width:122px}
th{padding:7px 9px;color:#fff;background:#3c72b8;text-align:left;font-weight:700;font-size:11.5px}
td{padding:7px 9px;border:1px solid #d3dbe7;vertical-align:top}
tr{page-break-inside:avoid;break-inside:avoid}
.sn{white-space:nowrap;font-size:10.5px;color:#334155;letter-spacing:.01em}
.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.line-title{font-weight:700}
.line-details{margin:4px 0 0;padding-left:14px;color:#5b6578;font-size:10.5px;font-weight:400;line-height:1.4}
.line-details li{margin:1px 0} div.line-details{padding-left:0}
.lower{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;page-break-inside:avoid;break-inside:avoid}
.notes{min-height:76px;padding:8px 10px;border:1px solid #b9c5d8;white-space:pre-wrap;background:#fbfcfe;page-break-inside:avoid;break-inside:avoid}
.notes strong{display:block;color:#17275b;margin-bottom:6px}
.notes[style]{min-height:0}
.totals{width:100%;border:1px solid #d3dbe7;page-break-inside:avoid;break-inside:avoid}
.row{display:flex;justify-content:space-between;align-items:center;padding:7px 10px;gap:14px;border-bottom:1px solid #edf1f6}
.row:last-child{border-bottom:0}
.row span:first-child{flex:1;color:#334155;white-space:nowrap}
.row span:last-child{white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:600}
.charge-scope{color:#687386;font-size:10.5px;font-weight:400}
.grand{background:#f4f7fb;font-size:12.5px;font-weight:800;color:#17275b;align-items:center;padding:9px 10px}
.grand span:first-child{color:#17275b;line-height:1.2;white-space:nowrap}
.grand span:last-child{font-size:14.5px}
.footer{margin-top:16px;color:#687386;font-size:9.5px;text-align:center;page-break-inside:avoid;break-inside:avoid}
@media print{body{padding:4px 2px}}
</style></head><body>
<div class="top"><div>${officialLogo}</div>
<div><h1 class="doc-title">${escapeHtml(title)}</h1><div class="meta">
<span>${isCreditNote ? "Credit Note No." : isInvoice ? "Tax Inv No." : isPurchaseOrder ? "PO No." : "Quotation No."}</span><b>${escapeHtml(quotation.number)}</b>
<span>Date</span><b>${escapeHtml(quoteDateLabel)}</b>
<span>Amount</span><b>${money(quotation.amountTotal)}</b>
<span>${isInvoice ? "Due date" : isPurchaseOrder ? "Expected" : "Valid until"}</span><b>${escapeHtml(validityDateLabel)}</b>
</div></div></div>
<div class="company"><strong>${escapeHtml(branding.name)}</strong>${companyLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>
<div class="addresses"><div><p class="address-title">${isCreditNote ? "Credit To:" : isInvoice ? "Tax Invoice To:" : isPurchaseOrder ? "Purchase Order To:" : "Quotation To:"}</p><div class="address-box"><p><strong>${escapeHtml(quotation.customerName)}</strong></p>${customerLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}${quotation.customerTaxId ? `<p>Tax ID: ${escapeHtml(quotation.customerTaxId)}</p>` : ""}</div></div>
<div><p class="address-title">Billing Address:</p><div class="address-box"><p><strong>${escapeHtml(quotation.customerName)}</strong></p>${customerLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div></div></div>
<table><colgroup><col class="col-sn" /><col /><col class="col-qty" /><col class="col-price" /><col class="col-total" /></colgroup>
<thead><tr><th style="text-align:center;width:44px;">S/N</th><th>Description</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Total Price</th></tr></thead>
<tbody>${officialRows}</tbody></table>
<div class="lower"><div class="notes"><strong>${isPurchaseOrder ? "Vendor terms" : "Notes"}</strong>${escapeHtml(notes)}</div><div class="totals">
<div class="row"><span>Sub Total</span><span>${money(subTotalValue)}</span></div>
${deliveryFeeRow}
${otherChargesRow}
${officialVatRow}
<div class="row grand"><span>${officialGrandLabel}</span><span>${money(quotation.amountTotal)}</span></div>
</div></div>
${paymentDetailsHtml}
${templates.footerText ? `<p class="footer">${escapeHtml(templates.footerText)}</p>` : ""}</body></html>`;
  }

  const subTotalValue = quotation.lineNetSubtotal ?? quotation.amountUntaxed;
  const deliveryFeeLabel = quotation.deliveryFeePercent
    ? `${isPurchaseOrder ? "Freight" : "Delivery fee"} (${quotation.deliveryFeePercent}%)`
    : isPurchaseOrder
      ? "Freight"
      : "Delivery fee";
  const deliveryFeeRow = quotation.deliveryFee
    ? `<div class="totals-row"><span class="muted">${escapeHtml(deliveryFeeLabel)}</span><span>+${formatDocumentMoney(quotation.deliveryFee, quotation.currencySymbol, quotation.decimalPlaces)}</span></div>`
    : "";
  const additionalChargeRows =
    !isPurchaseOrder && quotation.additionalChargeLines?.length
      ? quotation.additionalChargeLines
          .map(
            (charge) =>
              `<div class="totals-row"><span class="muted">${escapeHtml(charge.name)}${charge.scopeLabel ? ` <span class="charge-scope">(${escapeHtml(charge.scopeLabel)})</span>` : ""}</span><span>+${formatDocumentMoney(charge.amount, quotation.currencySymbol, quotation.decimalPlaces)}</span></div>`,
          )
          .join("")
      : "";
  const otherChargesRow =
    !isPurchaseOrder &&
    !quotation.additionalChargeLines?.length &&
    quotation.otherCharges
      ? `<div class="totals-row"><span class="muted">Other charges</span><span>+${formatDocumentMoney(quotation.otherCharges, quotation.currencySymbol, quotation.decimalPlaces)}</span></div>`
      : "";
  const stdVatNum = Number(quotation.amountTax ?? 0);
  const stdHasVat = Number.isFinite(stdVatNum) && stdVatNum > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)} ${escapeHtml(quotation.number)}</title>
  <style>
    * { box-sizing: border-box; }
    :root { --accent: #3568a9; --accent-dark: #172552; --soft: #f3f6fa; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; padding: 32px; font-size: 13px; border-top: 7px solid var(--accent-dark); }
    body.style-modern_navy { --accent: #159a8c; --accent-dark: #102a43; --soft: #edf8f6; border-top-width: 12px; }
    body.style-clean_minimal { --accent: #111827; --accent-dark: #111827; --soft: #fff; border-top-width: 2px; }
    .header { display: flex; justify-content: space-between; gap: 24px; align-items: center; margin-bottom: 24px; }
    .brand { display: flex; gap: 16px; align-items: center; }
    .logo { width: auto; height: 80px; max-width: 160px; object-fit: contain; }
    .logo-fallback { width: 80px; height: 80px; border-radius: 8px; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 24px; }
    .company-name { margin: 0; font-size: 20px; font-weight: 700; }
    .tagline { margin: 4px 0 0; color: #6b7280; font-size: 12px; }
    .doc-meta { text-align: right; }
    .doc-title { margin: 0; font-size: 22px; font-weight: 800; color: var(--accent-dark); }
    .doc-number { margin: 4px 0 0; font-weight: 600; }
    .muted { color: #6b7280; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0; }
    .section-label { margin: 0 0 8px; font-size: 11px; letter-spacing: 0.05em; color: #6b7280; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 14px 0; }
    th, td { padding: 7px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th { background: var(--accent); color: #fff; font-size: 12px; }
    .style-clean_minimal th { color: #111827; border-top: 1px solid #111827; border-bottom: 1px solid #111827; background: #fff; }
    .sn { white-space: nowrap; font-size: 11.5px; color: #374151; }
    .num { text-align: right; white-space: nowrap; }
    .line-title { font-weight: 700; }
    .line-details { margin: 4px 0 0; padding-left: 14px; color: #6b7280; font-size: 11.5px; font-weight: 400; line-height: 1.4; }
    .line-details li { margin: 1px 0; }
    div.line-details { padding-left: 0; }
    .totals { margin-left: auto; width: 340px; page-break-inside: avoid; break-inside: avoid; }
    .totals-row { display: flex; justify-content: space-between; padding: 4px 0; gap: 12px; }
    .totals-row span:first-child { flex: 1; white-space: nowrap; }
    .charge-scope { color: #9ca3af; font-size: 11px; font-weight: 400; }
    .total-strong { font-size: 16px; font-weight: 800; color: var(--accent); }
    .terms { margin-top: 18px; padding-top: 12px; border-top: 1px solid #e5e7eb; white-space: pre-wrap; page-break-inside: avoid; break-inside: avoid; }
    .footer { margin-top: 14px; color: #6b7280; font-size: 11px; page-break-inside: avoid; break-inside: avoid; }
  </style>
</head>
<body class="${styleClass}">
  <div class="header">
    <div class="brand">
      ${logoHtml}
      <div>
        <h1 class="company-name">${escapeHtml(branding.name)}</h1>
        ${profile.tagline ? `<p class="tagline">${escapeHtml(profile.tagline)}</p>` : ""}
        ${addressLine ? `<p class="tagline">${escapeHtml(addressLine)}</p>` : ""}
      </div>
    </div>
    <div class="doc-meta">
      <h2 class="doc-title">${escapeHtml(title)}</h2>
      <p class="doc-number">#${escapeHtml(quotation.number)}</p>
      <p class="muted">Date: ${escapeHtml(quoteDateLabel)}</p>
      ${validityDateLabel ? `<p class="muted">Valid until: ${escapeHtml(validityDateLabel)}</p>` : ""}
    </div>
  </div>

  <div class="grid">
    <div>
      <p class="section-label">${title.toLowerCase().includes("invoice") ? "Tax invoice to" : "Quotation to"}</p>
      <p><strong>${escapeHtml(quotation.customerName)}</strong></p>
      ${quotation.customerEmail ? `<p class="muted">${escapeHtml(quotation.customerEmail)}</p>` : ""}
      ${quotation.customerTaxId ? `<p class="muted">Tax ID: ${escapeHtml(quotation.customerTaxId)}</p>` : ""}
      ${quotation.customerAddress.map((line) => `<p class="muted">${escapeHtml(line)}</p>`).join("")}
    </div>
    <div>
      <p class="section-label">Billing address:</p>
      <p><strong>${escapeHtml(quotation.customerName)}</strong></p>
      ${quotation.customerAddress.length ? quotation.customerAddress.map((line) => `<p class="muted">${escapeHtml(line)}</p>`).join("") : `<p class="muted">No billing address provided</p>`}
      ${quotation.paymentReference ? `<p>Payment ref: ${escapeHtml(quotation.paymentReference)}</p>` : ""}
      ${quotation.customerReference ? `<p>Customer ref: ${escapeHtml(quotation.customerReference)}</p>` : ""}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align: center; width: 44px;">S/N</th>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Unit price</th>
        <th class="num">Disc.</th>
        <th class="num">Tax</th>
        <th class="num">Subtotal</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>

  <div class="totals">
    <div class="totals-row"><span class="muted">${quotation.deliveryFee ? "Subtotal" : "Untaxed amount"}</span><span>${formatDocumentMoney(subTotalValue, quotation.currencySymbol, quotation.decimalPlaces)}</span></div>
    ${deliveryFeeRow}
${additionalChargeRows}${otherChargesRow}
    ${stdHasVat ? `<div class="totals-row"><span class="muted">${escapeHtml(vatLabel)}</span><span>+${formatDocumentMoney(quotation.amountTax, quotation.currencySymbol, quotation.decimalPlaces)}</span></div>` : ""}
    <div class="totals-row"><span><strong>${stdHasVat ? "Total Amount (Including VAT)" : "Total Amount"}</strong></span><span class="total-strong">${formatDocumentMoney(quotation.amountTotal, quotation.currencySymbol, quotation.decimalPlaces)}</span></div>
  </div>

  ${quotation.notes ? `<div class="terms"><strong>Notes</strong>\n${escapeHtml(quotation.notes)}</div>` : ""}
  ${!quotation.notes && templates.defaultPaymentTerms ? `<div class="terms"><strong>Payment terms</strong>\n${escapeHtml(templates.defaultPaymentTerms)}</div>` : ""}
  ${!quotation.notes && templates.defaultDeliveryTerms ? `<div class="terms"><strong>Delivery terms</strong>\n${escapeHtml(templates.defaultDeliveryTerms)}</div>` : ""}
  ${!quotation.notes && templates.defaultWarrantyNotes ? `<div class="terms"><strong>Warranty</strong>\n${escapeHtml(templates.defaultWarrantyNotes)}</div>` : ""}
  ${templates.termsAndConditions ? `<div class="terms"><strong>Terms &amp; conditions</strong>\n${escapeHtml(templates.termsAndConditions)}</div>` : ""}
  ${paymentDetailsHtml}
  ${quotation.signedBy || quotation.signatureImage ? `
    <div style="margin-top:24px; padding:16px; border:1px solid #10b981; border-radius:6px; background:#f0fdf4;">
      <h4 style="margin:0 0 8px; color:#065f46; font-size:14px; font-weight:700;">Customer Digital Signature &amp; Authorization</h4>
      ${quotation.signatureImage ? `<div style="margin-bottom:8px;"><img src="${escapeHtml(quotation.signatureImage)}" alt="Signature" style="max-height:60px; max-width:250px;" /></div>` : ""}
      <p style="margin:2px 0;"><strong>Signed by:</strong> ${escapeHtml(quotation.signedBy || "Customer")}</p>
      ${quotation.signedOn ? `<p style="margin:2px 0; color:#4b5563; font-size:11px;"><strong>Signed Date:</strong> ${escapeHtml(quotation.signedOn)}</p>` : ""}
      ${quotation.signedIp ? `<p style="margin:2px 0; color:#4b5563; font-size:11px;"><strong>Signer IP:</strong> ${escapeHtml(quotation.signedIp)}</p>` : ""}
    </div>
  ` : quotation.customerReference ? `
    <div style="margin-top:24px; padding:12px; border:1px solid #3b82f6; border-radius:6px; background:#eff6ff;">
      <h4 style="margin:0 0 4px; color:#1e40af; font-size:13px; font-weight:700;">Customer Purchase Order (PO) Authorized</h4>
      <p style="margin:0; font-size:12px;"><strong>PO Number:</strong> ${escapeHtml(quotation.customerReference)}</p>
    </div>
  ` : ""}
  ${templates.footerText ? `<p class="footer">${escapeHtml(templates.footerText)}</p>` : ""}
</body>
</html>`;
}
