import { formatQuantity } from "../format-quantity";
import { formatCountryLabel } from "../locations";
import { resolveCompanyProfile } from "../schemas/company-settings";
import { renderLineItemDescriptionHtml } from "./line-item-details";
import type { OrganizationBranding } from "./quotation-document";
import { formatDocumentDate, formatTrnLabel } from "./quotation-document";

export interface DeliveryNoteDocumentLine {
  description: string;
  details?: string | null;
  serialNumber?: string | null;
  quantity: string;
}

export interface DeliveryNoteDocumentData {
  number: string;
  deliveryDate: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string | null;
  deliveryAddress: string[];
  receivedBy?: string | null;
  signedOn?: string | null;
  signatureImage?: string | null;
  lines: DeliveryNoteDocumentLine[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderDeliveryNoteDocumentHtml(
  branding: OrganizationBranding,
  note: DeliveryNoteDocumentData,
): string {
  const profile = resolveCompanyProfile(branding.companyProfile);
  const country = formatCountryLabel(profile.country);
  const trnLabel = formatTrnLabel(profile.taxId);
  const companyLines = [
    profile.address,
    [profile.city, country].filter(Boolean).join(", "),
    trnLabel,
    profile.phone && `Phone: ${profile.phone}`,
    profile.email && `Email: ${profile.email}`,
    profile.website && `Website: ${profile.website}`,
  ].filter((line): line is string => Boolean(line));

  const logoHtml = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.name)}" class="brand-logo" />`
    : `<div class="brand-logo-fallback">${escapeHtml(branding.name.charAt(0).toUpperCase())}</div>`;

  const lineRows = note.lines
    .map(
      (line, index) => `
      <tr>
        <td class="sn">${index + 1}</td>
        <td>${renderLineItemDescriptionHtml(line.description, line.details, "bullets")}</td>
        <td class="num">${escapeHtml(formatQuantity(line.quantity))}</td>
        <td>${escapeHtml(line.serialNumber?.trim() || "—")}</td>
      </tr>`,
    )
    .join("");

  const deliveryAddressHtml = note.deliveryAddress
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");

  const receivedByHtml = note.receivedBy?.trim()
    ? escapeHtml(note.receivedBy)
    : "&nbsp;";
  const signatureHtml = note.signatureImage?.trim()
    ? `<img src="${escapeHtml(note.signatureImage)}" alt="Receiver signature" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Delivery Note ${escapeHtml(note.number)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; background: #fff; font-size: 13px; }
    .header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 24px; }
    .brand-logo { max-height: 72px; max-width: 220px; object-fit: contain; }
    .brand-logo-fallback { width: 72px; height: 72px; border-radius: 12px; background: #0f4c81; color: #fff; display: grid; place-items: center; font-size: 28px; font-weight: 700; }
    .doc-title { font-size: 28px; font-weight: 700; color: #0f4c81; margin: 0 0 4px; }
    .doc-meta { color: #64748b; font-size: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .panel { border: 1px solid #dbe3ea; border-radius: 8px; padding: 14px 16px; background: #f8fafc; }
    .panel h3 { margin: 0 0 8px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; }
    .panel .name { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #cbd5e1; padding: 10px 12px; vertical-align: top; }
    th { background: #0f4c81; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
    td.sn, th.sn { width: 42px; text-align: center; }
    td.num, th.num { width: 80px; text-align: right; white-space: nowrap; }
    .signature-block { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .signature-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; min-height: 120px; background: #fff; }
    .signature-box--empty { min-height: 90px; }
    .handwrite-line { border-bottom: 1px solid #64748b; min-height: 28px; margin-top: 8px; }
    .signature-box img { max-width: 100%; max-height: 90px; object-fit: contain; }
    .signature-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 8px; }
    .footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 11px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${logoHtml}
      <div style="margin-top:12px;">
        <div style="font-weight:700;font-size:16px;">${escapeHtml(branding.name)}</div>
        ${companyLines.map((line) => `<div style="color:#475569;margin-top:2px;">${escapeHtml(line)}</div>`).join("")}
      </div>
    </div>
    <div style="text-align:right;">
      <h1 class="doc-title">Delivery Note</h1>
      <div class="doc-meta"><strong>${escapeHtml(note.number)}</strong></div>
      <div class="doc-meta">Date: ${escapeHtml(formatDocumentDate(note.deliveryDate))}</div>
      <div class="doc-meta">Invoice ref: ${escapeHtml(note.invoiceNumber)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="panel">
      <h3>Deliver to</h3>
      <div class="name">${escapeHtml(note.customerName)}</div>
      ${note.customerEmail ? `<div style="color:#475569;margin-bottom:6px;">${escapeHtml(note.customerEmail)}</div>` : ""}
      ${deliveryAddressHtml}
    </div>
    <div class="panel">
      <h3>Delivery details</h3>
      <div><strong>Delivery date:</strong> ${escapeHtml(formatDocumentDate(note.deliveryDate))}</div>
      <div style="margin-top:6px;"><strong>Invoice:</strong> ${escapeHtml(note.invoiceNumber)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="sn">#</th>
        <th>Description</th>
        <th class="num">Qty</th>
        <th>Serial number</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>

  <div class="signature-block">
    <div>
      <div class="signature-label">Received by (print name)</div>
      <div class="handwrite-line">${receivedByHtml}</div>
    </div>
    <div>
      <div class="signature-label">Signature</div>
      <div class="signature-box signature-box--empty">${signatureHtml}</div>
    </div>
  </div>

  <div class="footer">Generated from Frogmen ERP · ${escapeHtml(new Date().toLocaleString())}</div>
</body>
</html>`;
}
