"use client";

import { Button, InlineStack, Spinner, Text } from "@shopify/polaris";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  getQuotationDocumentHtml,
  getQuotationDocumentPdfUrl,
  getInvoiceDocumentHtml,
  getInvoiceDocumentPdfUrl,
  getPurchaseOrderDocumentHtml,
  getPurchaseOrderDocumentPdfUrl,
} from "@/lib/settings-api";

interface DocumentPreviewModalProps {
  open: boolean;
  onClose: () => void;
  quotationId: string;
  quotationNumber: string;
  title?: string;
  documentType?: "quotation" | "invoice" | "purchase_order";
}

export function DocumentPreviewModal({
  open,
  onClose,
  quotationId,
  quotationNumber,
  title = "Document preview",
  documentType = "quotation",
}: DocumentPreviewModalProps) {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!quotationId) return;
    setLoading(true);
    setError(null);

    try {
      const documentHtml =
        documentType === "invoice"
          ? await getInvoiceDocumentHtml(quotationId)
          : documentType === "purchase_order"
            ? await getPurchaseOrderDocumentHtml(quotationId)
            : await getQuotationDocumentHtml(quotationId);
      setHtml(documentHtml);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load document preview");
      setHtml("");
    } finally {
      setLoading(false);
    }
  }, [documentType, quotationId]);

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [open, load]);

  function handlePrintPdf() {
    const pdfUrl =
      documentType === "invoice"
        ? getInvoiceDocumentPdfUrl(quotationId)
        : documentType === "purchase_order"
          ? getPurchaseOrderDocumentPdfUrl(quotationId)
          : getQuotationDocumentPdfUrl(quotationId);
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
  }

  if (!open) return null;

  return (
    <div className="document-preview-panel" role="dialog" aria-modal="true">
      <button className="document-preview-panel__overlay" type="button" aria-label="Close preview" onClick={onClose} />
      <aside className="document-preview-panel__drawer">
        <header className="document-preview-panel__header">
          <div>
            <Text as="h2" variant="headingLg">{title}</Text>
            <Text as="p" tone="subdued">#{quotationNumber}</Text>
          </div>
          <button className="document-preview-panel__close" type="button" aria-label="Close preview" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="document-preview-panel__body">
        {loading ? (
          <InlineStack align="center" blockAlign="center" gap="200">
            <Spinner size="small" />
            <Text as="p" tone="subdued">
              Loading branded document...
            </Text>
          </InlineStack>
        ) : null}

        {error ? (
          <Text as="p" tone="critical">
            {error}
          </Text>
        ) : null}

        {!loading && !error && html ? (
          <div
            style={{
              background: "#ffffff",
              borderRadius: "8px",
              border: "1px solid #e1e3e5",
              overflow: "hidden",
            }}
          >
            <iframe
              title={`Document preview ${quotationNumber}`}
              srcDoc={html}
              style={{
                width: "100%",
                minHeight: "70vh",
                border: "none",
                background: "#ffffff",
              }}
            />
          </div>
        ) : null}

        {!loading && !error ? (
          <Text as="p" tone="subdued" variant="bodySm">
            Uses your saved document template.
          </Text>
        ) : null}
        </div>
        <footer className="document-preview-panel__footer">
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={handlePrintPdf}>Open PDF</Button>
        </footer>
      </aside>
    </div>
  );
}
