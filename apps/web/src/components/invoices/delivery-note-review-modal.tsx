"use client";

import {
  Banner,
  BlockStack,
  Button,
  InlineStack,
  Spinner,
  Text,
} from "@shopify/polaris";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LineItemDescription } from "@/components/sales/line-item-description";
import { formatQuantity } from "@/lib/format-quantity";
import {
  approveDeliveryNote,
  getDeliveryNoteDocumentPdfUrl,
  getDeliveryNotePreviewPdfUrl,
  previewDeliveryNote,
  type DeliveryNote,
  type DeliveryNoteLine,
} from "@/lib/delivery-notes-api";

interface DeliveryNoteReviewModalProps {
  open: boolean;
  invoiceId: string;
  invoiceNumber: string;
  onClose: () => void;
  onApproved?: (note: DeliveryNote) => void;
}

export function DeliveryNoteReviewModal({
  open,
  invoiceId,
  invoiceNumber,
  onClose,
  onApproved,
}: DeliveryNoteReviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<DeliveryNote | null>(null);

  const isApproved = note?.state === "approved" && Boolean(note.id);

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    setError(null);
    try {
      const preview = await previewDeliveryNote(invoiceId);
      setNote(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load delivery note");
      setNote(null);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [open, load]);

  async function handleApprove() {
    if (!note) return;

    setSaving(true);
    setError(null);
    try {
      const approved = await approveDeliveryNote(invoiceId, {
        deliveryDate: note.deliveryDate,
      });
      setNote(approved);
      onApproved?.(approved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve delivery note");
    } finally {
      setSaving(false);
    }
  }

  function handlePreviewPdf() {
    const url = isApproved && note?.id
      ? getDeliveryNoteDocumentPdfUrl(note.id)
      : getDeliveryNotePreviewPdfUrl(invoiceId);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handlePrint() {
    handlePreviewPdf();
  }

  function renderSerialEntries(line: DeliveryNoteLine) {
    if (line.serialEntries?.length) {
      return (
        <BlockStack gap="050">
          {line.serialEntries.map((entry, idx) => (
            <div
              key={`${entry.productName}-${entry.serialNumber}-${idx}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "8px",
                padding: "2px 0",
                borderBottom:
                  idx < line.serialEntries!.length - 1
                    ? "1px dashed #e5e7eb"
                    : "none",
              }}
            >
              <Text
                as="span"
                variant="bodySm"
                fontWeight={entry.isKit ? "semibold" : "regular"}
                tone={entry.isKit ? undefined : "subdued"}
              >
                {entry.productName}
              </Text>
              <span
                style={{
                  fontFamily: "Consolas, monospace",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {entry.serialNumber}
              </span>
            </div>
          ))}
        </BlockStack>
      );
    }

    if (line.serialNumber?.trim()) {
      const lines = line.serialNumber
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      return (
        <BlockStack gap="050">
          {lines.map((l, idx) => {
            const splitIndex = l.indexOf(" · ");
            const name = splitIndex !== -1 ? l.slice(0, splitIndex).trim() : null;
            const code = splitIndex !== -1 ? l.slice(splitIndex + 3).trim() : l;
            return (
              <div
                key={`${l}-${idx}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "8px",
                  padding: "2px 0",
                  borderBottom: idx < lines.length - 1 ? "1px dashed #e5e7eb" : "none",
                }}
              >
                {name ? (
                  <Text as="span" variant="bodySm" tone="subdued">
                    {name}
                  </Text>
                ) : null}
                <span
                  style={{
                    fontFamily: "Consolas, monospace",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {code}
                </span>
              </div>
            );
          })}
        </BlockStack>
      );
    }

    return <Text as="span" tone="subdued">—</Text>;
  }

  if (!open) return null;

  const deliveryAddressPreview =
    note?.deliveryAddress?.length
      ? note.deliveryAddress
      : [
          note?.deliveryStreet1,
          note?.deliveryStreet2,
          [note?.deliveryCity, note?.deliveryStateCode, note?.deliveryZip]
            .filter(Boolean)
            .join(", "),
          note?.deliveryCountryCode,
        ].filter(Boolean);

  return (
    <div className="document-preview-panel" role="dialog" aria-modal="true">
      <button
        className="document-preview-panel__overlay"
        type="button"
        aria-label="Close delivery note"
        onClick={onClose}
      />
      <aside className="document-preview-panel__drawer" style={{ width: "min(56rem, calc(100vw - 2rem))" }}>
        <header className="document-preview-panel__header">
          <div>
            <Text as="h2" variant="headingMd">
              Delivery note review
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Invoice {invoiceNumber}
              {note?.number ? ` · ${note.number}` : " · Draft preview"}
            </Text>
          </div>
          <button
            className="document-preview-panel__close"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="document-preview-panel__body">
          {loading ? (
            <InlineStack align="center" blockAlign="center">
              <Spinner accessibilityLabel="Loading delivery note" size="large" />
            </InlineStack>
          ) : error && !note ? (
            <Banner tone="critical">{error}</Banner>
          ) : note ? (
            <BlockStack gap="500">
              {error ? <Banner tone="critical">{error}</Banner> : null}
              {isApproved ? (
                <Banner tone="success">
                  Delivery note {note.number} is approved. You can open or print the PDF.
                </Banner>
              ) : (
                <Banner tone="info">
                  Delivery address and items come from the customer and invoice. Received by
                  and signature stay blank on the printed form for the person who accepts the
                  delivery to fill in by hand.
                </Banner>
              )}

              <div className="delivery-note-preview card">
                <div className="delivery-note-preview__header">
                  <div>
                    {note.companyLogoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={note.companyName}
                        className="delivery-note-preview__logo"
                        src={note.companyLogoUrl}
                      />
                    ) : (
                      <div className="delivery-note-preview__logo-fallback">
                        {note.companyName.charAt(0)}
                      </div>
                    )}
                    <BlockStack gap="050">
                      <Text as="p" fontWeight="bold">
                        {note.companyName}
                      </Text>
                      {note.companyAddress.map((line) => (
                        <Text key={line} as="p" tone="subdued" variant="bodySm">
                          {line}
                        </Text>
                      ))}
                    </BlockStack>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Text as="p" variant="headingLg" fontWeight="bold">
                      Delivery Note
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Goods dispatch record
                    </Text>
                  </div>
                </div>

                <div className="delivery-note-preview__body">
                  <div className="delivery-note-preview__refs">
                    <BlockStack gap="050">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Delivery note
                      </Text>
                      <Text as="p" fontWeight="semibold">
                        {note.number ?? "Pending approval"}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="050">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Delivery date
                      </Text>
                      <Text as="p" fontWeight="semibold">
                        {note.deliveryDate}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="050">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Invoice reference
                      </Text>
                      <Text as="p" fontWeight="semibold">
                        {note.invoiceNumber}
                      </Text>
                    </BlockStack>
                  </div>

                  <div className="delivery-note-preview__grid">
                    <div className="delivery-note-preview__ship-to">
                      <BlockStack gap="100">
                        <Text as="span" tone="subdued" variant="bodySm">
                          Ship to
                        </Text>
                        <Text as="p" fontWeight="semibold">
                          {note.customerName}
                        </Text>
                        {note.customerEmail ? (
                          <Text as="p" tone="subdued" variant="bodySm">
                            {note.customerEmail}
                          </Text>
                        ) : null}
                        {deliveryAddressPreview.map((line) => (
                          <Text key={line} as="p" variant="bodySm">
                            {line}
                          </Text>
                        ))}
                      </BlockStack>
                    </div>
                    <BlockStack gap="100">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Receipt (filled on delivery)
                      </Text>
                      <Text as="p" variant="bodySm">
                        Received by:{" "}
                        <span className="delivery-note-handwrite-line">
                          {note.receivedBy?.trim() || "\u00a0"}
                        </span>
                      </Text>
                      <div className="delivery-note-handwrite-signature" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                        <div>
                          <Text as="span" tone="subdued" variant="bodySm">
                            Signature
                          </Text>
                          {note.signatureImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img alt="Receiver signature" src={note.signatureImage} />
                          ) : null}
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <Text as="span" tone="subdued" variant="bodySm">
                            Company Stamp
                          </Text>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            alt="Company Stamp"
                            src="/unnamed8.jpg"
                            style={{ maxHeight: 60, width: "auto", objectFit: "contain", marginTop: 4, display: "block" }}
                          />
                        </div>
                      </div>
                    </BlockStack>
                  </div>

                  <div className="frogmen-recent-table-wrapper" style={{ marginTop: 16 }}>
                  <table className="frogmen-recent-table" style={{ tableLayout: "fixed", width: "100%" }}>
                    <colgroup>
                      <col style={{ width: "58%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "32%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th style={{ textAlign: "right" }}>Qty</th>
                        <th>Serial number</th>
                      </tr>
                    </thead>
                    <tbody>
                      {note.lines.map((line) => (
                        <tr key={line.invoiceLineId ?? line.lineNumber}>
                          <td>
                            <LineItemDescription
                              details={line.productDescription}
                              productId={line.productId}
                              title={line.description}
                            />
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {formatQuantity(line.quantity)}
                          </td>
                          <td>{renderSerialEntries(line)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </div>
              </div>
            </BlockStack>
          ) : null}
        </div>

        <footer className="document-preview-panel__footer">
          <InlineStack gap="200">
            <Button onClick={onClose}>Close</Button>
            {note ? (
              <Button onClick={handlePreviewPdf}>
                Preview PDF
              </Button>
            ) : null}
            {isApproved ? (
              <Button variant="primary" onClick={handlePrint}>
                Print
              </Button>
            ) : (
              <Button variant="primary" loading={saving} onClick={() => void handleApprove()}>
                Confirm delivery note
              </Button>
            )}
          </InlineStack>
        </footer>
      </aside>
    </div>
  );
}
