import { formatQuantity } from "../format-quantity";
import { formatCountryLabel } from "../locations";
import { resolveCompanyProfile } from "../schemas/company-settings";
import { renderLineItemDescriptionHtml } from "./line-item-details";
import { resolveCompanyStampUrl } from "./company-stamp";
import type { OrganizationBranding } from "./quotation-document";
import { formatDocumentDate, formatTrnLabel } from "./quotation-document";

export interface DeliveryNoteDocumentLine {
  description: string;
  details?: string | null;
  serialNumber?: string | null;
  serialEntries?: Array<{
    productName: string;
    serialNumber: string;
    isKit?: boolean;
  }>;
  quantity: string;
}

export interface DeliveryNoteDocumentData {
  number: string;
  deliveryDate: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone?: string | null;
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

function renderSerialEntriesHtml(
  entries?: Array<{ productName: string; serialNumber: string; isKit?: boolean }>,
  fallback?: string | null,
): string {
  const renderEntry = (
    productName: string,
    serialNumber: string,
    isKit = false,
  ) => `<div class="serial-entry${isKit ? " serial-entry--kit" : ""}">
      <span class="serial-name">${escapeHtml(productName)}</span>
      <span class="serial-code">${escapeHtml(serialNumber)}</span>
    </div>`;

  if (entries?.length) {
    return entries
      .map((entry) =>
        renderEntry(entry.productName, entry.serialNumber, Boolean(entry.isKit)),
      )
      .join("");
  }

  if (fallback?.trim()) {
    return fallback
      .split("\n")
      .map((line) => {
        const splitIndex = line.indexOf(" · ");
        if (splitIndex === -1) {
          return `<div class="serial-entry"><span class="serial-code">${escapeHtml(line.trim())}</span></div>`;
        }
        return renderEntry(
          line.slice(0, splitIndex).trim(),
          line.slice(splitIndex + 3).trim(),
        );
      })
      .join("");
  }

  return `<span class="serial-empty">—</span>`;
}

export function renderDeliveryNoteDocumentHtml(
  branding: OrganizationBranding,
  note: DeliveryNoteDocumentData,
): string {
  const profile = resolveCompanyProfile(branding.companyProfile);
  const stampUrl = resolveCompanyStampUrl(branding.stampUrl);
  const country = formatCountryLabel(profile.country);
  const trnLabel = formatTrnLabel(profile.taxId);
  const isDraft = note.number === "DRAFT";
  const documentNumber = isDraft ? "Pending approval" : note.number;

  const companyLines = [
    profile.address,
    [profile.city, country].filter(Boolean).join(", "),
    trnLabel,
    profile.phone && `Phone: ${profile.phone}`,
    profile.email && `Email: ${profile.email}`,
  ].filter((line): line is string => Boolean(line));

  const logoHtml = branding.logoUrl
    ? `<img class="brand-logo" src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.name)}" />`
    : `<div class="brand-fallback">${escapeHtml(branding.name.charAt(0).toUpperCase())}</div>`;

  const deliveryAddressHtml = note.deliveryAddress.length
    ? note.deliveryAddress.map((line) => `<div>${escapeHtml(line)}</div>`).join("")
    : (() => {
        const fb = [
          note.customerPhone ? `Phone: ${note.customerPhone}` : null,
          note.customerEmail ? `Email: ${note.customerEmail}` : null,
        ].filter(Boolean);
        return fb.length
          ? fb.map((l) => `<div class="muted">${escapeHtml(l as string)}</div>`).join("")
          : `<div class="muted">No delivery address on file</div>`;
      })();

  const lineRows = note.lines
    .map(
      (line, index) => `
      <tr>
        <td class="sn">${index + 1}</td>
        <td>${renderLineItemDescriptionHtml(line.description, line.details, "bullets")}</td>
        <td class="num">${escapeHtml(formatQuantity(line.quantity))}</td>
        <td class="serials">${renderSerialEntriesHtml(line.serialEntries, line.serialNumber)}</td>
      </tr>`,
    )
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
  <title>Delivery Note ${escapeHtml(documentNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 28px 32px;
      font-family: "Segoe UI", Arial, sans-serif;
      color: #1f2937;
      background: #fff;
      font-size: 12px;
      line-height: 1.45;
    }
    .sheet {
      border: 2px solid #111827;
      border-radius: 2px;
      overflow: hidden;
    }
    .sheet-head {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 20px;
      align-items: center;
      padding: 18px 22px;
      background: #111827;
      color: #fff;
    }
    .brand-row {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .brand-logo {
      height: 56px;
      max-width: 140px;
      object-fit: contain;
      filter: brightness(0) invert(1);
    }
    .brand-fallback {
      width: 56px;
      height: 56px;
      border-radius: 8px;
      background: #374151;
      color: #fff;
      display: grid;
      place-items: center;
      font-size: 22px;
      font-weight: 800;
    }
    .sender-name {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .sender-meta {
      color: #d1d5db;
      font-size: 10.5px;
    }
    .doc-stamp {
      text-align: right;
    }
    .doc-stamp h1 {
      margin: 0;
      font-size: 26px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      font-weight: 800;
    }
    .doc-stamp p {
      margin: 4px 0 0;
      color: #d1d5db;
      font-size: 11px;
    }
    .doc-stamp .draft {
      display: inline-block;
      margin-top: 8px;
      padding: 3px 10px;
      border: 1px solid #fbbf24;
      color: #fde68a;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .refs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
    }
    .ref {
      padding: 12px 16px;
      border-right: 1px solid #e5e7eb;
    }
    .ref:last-child { border-right: 0; }
    .ref-label {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 4px;
    }
    .ref-value {
      font-size: 13px;
      font-weight: 700;
      color: #111827;
    }
    .ship-block {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .ship-to {
      padding: 16px 20px;
      border-right: 1px solid #e5e7eb;
      background: #fffbeb;
    }
    .ship-note {
      padding: 16px 20px;
      background: #fff;
    }
    .block-label {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #92400e;
      margin-bottom: 8px;
    }
    .ship-note .block-label { color: #374151; }
    .ship-name {
      font-size: 16px;
      font-weight: 800;
      color: #111827;
      margin-bottom: 4px;
    }
    .ship-to .muted,
    .ship-note .muted {
      color: #6b7280;
      font-size: 11px;
    }
    .items {
      padding: 0 0 4px;
    }
    .items-title {
      padding: 10px 20px 0;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #374151;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    col.col-sn { width: 36px; }
    col.col-qty { width: 48px; }
    col.col-serials { width: 300px; }
    th {
      padding: 10px 14px;
      text-align: left;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #374151;
      background: #f3f4f6;
      border-top: 1px solid #e5e7eb;
      border-bottom: 2px solid #111827;
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
    }
    tr:last-child td { border-bottom: 0; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    .sn { text-align: center; color: #6b7280; font-weight: 700; font-size: 12px; }
    .num { text-align: center; font-weight: 700; font-size: 12px; }
    .line-title { font-weight: 700; color: #111827; font-size: 13px; }
    .line-details {
      margin: 4px 0 0;
      padding-left: 16px;
      color: #4b5563;
      font-size: 11.5px;
      line-height: 1.4;
    }
    .line-details li { margin: 2px 0; }
    div.line-details { padding-left: 0; }
    .serial-entry {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: baseline;
      padding: 4px 0;
      border-bottom: 1px dashed #e5e7eb;
    }
    .serial-entry:last-child { border-bottom: 0; }
    .serial-name { color: #374151; font-size: 11.5px; font-weight: 600; }
    .serial-entry--kit .serial-name { color: #111827; font-weight: 800; font-size: 12px; }
    .serial-code {
      font-family: Consolas, "Courier New", monospace;
      font-size: 11.5px;
      font-weight: 700;
      color: #111827;
      white-space: nowrap;
    }
    .serial-empty { color: #9ca3af; font-size: 12px; }
    .acceptance {
      display: grid;
      grid-template-columns: 165px 1fr;
      gap: 16px;
      margin-top: 14px;
      border-top: 2px solid #111827;
      padding-top: 14px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .accept-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 12px 14px;
    }
    .accept-card-title {
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #111827;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 6px;
      margin-bottom: 10px;
    }
    .accept-row {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .accept-box-flex {
      flex: 1;
    }
    .accept-label {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #4b5563;
      margin-bottom: 6px;
    }
    .handwrite-line {
      min-height: 26px;
      border-bottom: 2px solid #111827;
      background: #fff;
    }
    .signature-box {
      min-height: 64px;
      border: 2px dashed #9ca3af;
      border-radius: 4px;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .signature-box img {
      max-width: 100%;
      max-height: 60px;
      object-fit: contain;
    }
    .stamp-placeholder-box {
      width: 130px;
      height: 64px;
      border: 2px dashed #94a3b8;
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: #475569;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      background: #ffffff;
      padding: 4px;
    }
    .footer { margin-top: 14px; color: #6b7280; font-size: 11px; page-break-inside: avoid; break-inside: avoid; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="sheet-head">
      <div class="brand-row">
        ${logoHtml}
        <div>
          <div class="sender-name">${escapeHtml(branding.name)}</div>
          <div class="sender-meta">${companyLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div>
        </div>
      </div>
      <div class="doc-stamp">
        <h1>Delivery Note</h1>
        <p>Goods dispatch record</p>
        ${isDraft ? `<span class="draft">Draft preview</span>` : ""}
      </div>
    </div>

    <div class="refs">
      <div class="ref">
        <div class="ref-label">Delivery Note #</div>
        <div class="ref-value">${escapeHtml(note.number ?? "Pending approval")}</div>
      </div>
      <div class="ref">
        <div class="ref-label">Delivery Date</div>
        <div class="ref-value">${escapeHtml(note.deliveryDate)}</div>
      </div>
      <div class="ref">
        <div class="ref-label">Invoice Ref</div>
        <div class="ref-value">${escapeHtml(note.invoiceNumber)}</div>
      </div>
    </div>

    <div class="ship-block">
      <div class="ship-to">
        <div class="block-label">Ship to</div>
        <div class="ship-name">${escapeHtml(note.customerName)}</div>
        <div style="margin-top:8px;">${deliveryAddressHtml}</div>
      </div>
      <div class="ship-note">
        <div class="block-label">Instructions</div>
        <p style="margin:0 0 8px;">Verify items and serial numbers before handover.</p>
        <p class="muted" style="margin:0;">The receiver signs below to confirm delivery.</p>
      </div>
    </div>

    <div class="items">
      <div class="items-title">Items delivered</div>
      <table>
        <colgroup>
          <col class="col-sn" />
          <col />
          <col class="col-qty" />
          <col class="col-serials" />
        </colgroup>
        <thead>
          <tr>
            <th class="sn">#</th>
            <th>Description</th>
            <th class="num">Qty</th>
            <th>Serial numbers</th>
          </tr>
        </thead>
        <tbody>${lineRows}</tbody>
      </table>
    </div>

    <div class="acceptance">
      <div class="accept-card" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
        <div class="accept-card-title" style="width: 100%;">Delivered / Issued by</div>
        <div class="accept-label" style="margin-bottom: 6px;">Supplier Stamp</div>
        <img src="${stampUrl}" alt="Supplier Stamp" style="max-height: 72px; width: auto; max-width: 110px; object-fit: contain; display: block;" />
      </div>

      <div class="accept-card">
        <div class="accept-card-title">Received & Accepted by (${escapeHtml(note.customerName)})</div>
        <div style="margin-bottom: 8px;">
          <div class="accept-label">Received by (Print Name)</div>
          <div class="handwrite-line">${receivedByHtml}</div>
        </div>
        <div class="accept-row">
          <div class="accept-box-flex">
            <div class="accept-label">Receiver Signature</div>
            <div class="signature-box" style="height: 64px; min-height: 64px;">${signatureHtml}</div>
          </div>
          <div style="text-align: center;">
            <div class="accept-label" style="margin-bottom: 6px;">Receiver Stamp</div>
            <div class="stamp-placeholder-box">
              <span>Customer</span>
              <span>Stamp</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">${escapeHtml(branding.name)} · Delivery note · Not a tax invoice</div>
  </div>
</body>
</html>`;
}
