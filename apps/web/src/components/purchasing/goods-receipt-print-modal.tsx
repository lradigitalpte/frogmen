"use client";

import {
  BlockStack,
  InlineStack,
  Modal,
  Text,
} from "@shopify/polaris";
import type { GoodsReceipt } from "@/lib/purchase-orders-api";
import { formatReceiveQuantity } from "@/components/purchasing/receive-serial-entry";

interface GoodsReceiptPrintModalProps {
  open: boolean;
  receipt: GoodsReceipt;
  onClose: () => void;
}

function formatPrintDate(value: string | null | undefined) {
  if (!value) return " ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function buildPrintHtml(receipt: GoodsReceipt) {
  const lines = receipt.lines ?? [];
  const lineRows = lines
    .map((line) => {
      const serials = line.trackSerial
        ? (line.serialNumbers ?? []).join(", ") || " "
        : "Bulk";
      return `<tr>
        <td>${escapeHtml(line.productName ?? "")}${line.productSku ? `<br><small>${escapeHtml(line.productSku)}</small>` : ""}</td>
        <td>${escapeHtml(line.warehouseName ?? " ")}</td>
        <td style="text-align:right">${escapeHtml(formatReceiveQuantity(line.quantity))}</td>
        <td>${escapeHtml(serials)}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="header">
      <h1>Goods Receipt ${escapeHtml(receipt.number)}</h1>
      <p class="meta">Validated goods receipt   warehouse receiving record</p>
    </div>
    <table class="meta-table">
      <tr><td><strong>Vendor</strong></td><td>${escapeHtml(receipt.vendorName ?? " ")}</td></tr>
      <tr><td><strong>Purchase order</strong></td><td>${escapeHtml(receipt.purchaseOrderNumber ?? " ")}</td></tr>
      <tr><td><strong>Receipt date</strong></td><td>${escapeHtml(formatPrintDate(receipt.receiptDate))}</td></tr>
      <tr><td><strong>Validated</strong></td><td>${escapeHtml(formatPrintDate(receipt.validatedAt))}</td></tr>
      <tr><td><strong>Status</strong></td><td>${escapeHtml(receipt.state === "done" ? "Validated" : receipt.state)}</td></tr>
    </table>
    <h2>Received products</h2>
    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th>Warehouse</th>
          <th style="text-align:right">Qty</th>
          <th>Serial numbers</th>
        </tr>
      </thead>
      <tbody>${lineRows}</tbody>
    </table>
    ${receipt.notes ? `<p class="notes"><strong>Notes:</strong> ${escapeHtml(receipt.notes)}</p>` : ""}
    <p class="footer">Generated from Frogmen ERP · ${escapeHtml(new Date().toLocaleString())}</p>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printStyles() {
  return `
    body { font-family: system-ui, -apple-system, sans-serif; color: #111; margin: 0; padding: 24px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 16px; margin: 24px 0 8px; }
    .meta { color: #555; margin: 0 0 16px; font-size: 14px; }
    .meta-table { width: 100%; margin-bottom: 8px; border-collapse: collapse; }
    .meta-table td { padding: 4px 8px 4px 0; font-size: 14px; vertical-align: top; }
    .meta-table td:first-child { width: 140px; color: #555; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; }
    th { background: #f4f4f4; font-weight: 600; }
    small { color: #666; }
    .notes { margin-top: 20px; font-size: 14px; }
    .footer { margin-top: 32px; font-size: 12px; color: #777; border-top: 1px solid #ddd; padding-top: 12px; }
  `;
}

export function GoodsReceiptPrintModal({
  open,
  receipt,
  onClose,
}: GoodsReceiptPrintModalProps) {
  const printHtml = buildPrintHtml(receipt);

  function handlePrint() {
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${receipt.number}   Goods Receipt</title>
    <style>${printStyles()}</style>
  </head>
  <body>${printHtml}</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  }

  return (
    <Modal
      open={open}
      primaryAction={{
        content: "Print",
        onAction: handlePrint,
      }}
      secondaryActions={[{ content: "Close", onAction: onClose }]}
      title={`Print receipt   ${receipt.number}`}
      onClose={onClose}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Text as="p" tone="subdued">
            Preview the receiving record before printing. Use this as a warehouse
            sign-off or filing copy.
          </Text>
          <div
            style={{
              background: "#fff",
              border: "1px solid #e1e3e5",
              borderRadius: 8,
              padding: 16,
            }}
          >
            <style>{printStyles()}</style>
            <div dangerouslySetInnerHTML={{ __html: printHtml }} />
          </div>
          <InlineStack gap="200">
            <Text as="span" tone="subdued" variant="bodySm">
              Branded PDF templates are not available for goods receipts yet  
              this print view includes all received lines and serial numbers.
            </Text>
          </InlineStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
