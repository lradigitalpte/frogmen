"use client";

import { use, useEffect, useRef, useState } from "react";
import {
  formatCountryLabel,
  formatDocumentDate,
  formatPostalAddressLines,
  formatProductDetailsInline,
  formatTrnLabel,
  formatVatLabel,
  productDetailsLines,
  type LineItemDetailsLayout,
} from "@frog1/shared";
import { formatMoney } from "@/components/sales/format-money";
import { formatQuantity } from "@/lib/format-quantity";
import { resolveDeliveryFee } from "@/lib/line-item-utils";
import {
  isCanvasBlank,
  readSignatureUpload,
  textToSignatureDataUrl,
} from "@/lib/public-signature-utils";
import "../public-quotation.css";

type SignatureMode = "draw" | "type" | "upload";

interface QuotationLine {
  id: string;
  description: string;
  productDescription?: string | null;
  serialNumber?: string | null;
  quantity: string;
  unitPrice: string;
  priceSubtotal: string;
  discountPercent: string;
  taxRatePercent: string;
}

interface PublicQuotationData {
  id: string;
  number: string;
  state: string;
  quoteDate: string;
  validityDate: string | null;
  customerReference: string | null;
  notes: string | null;
  amountUntaxed: string;
  amountTax: string;
  amountTotal: string;
  deliveryFeeAmount?: string | null;
  deliveryFeePercent?: string | null;
  currencySymbol: string;
  currencyCode: string;
  customerName: string;
  customerEmail: string | null;
  customerTaxId: string | null;
  customerStreet1: string | null;
  customerStreet2: string | null;
  customerCity: string | null;
  customerState: string | null;
  customerZip: string | null;
  customerCountry: string | null;
  signedBy: string | null;
  signedOn: string | null;
  signedEmail: string | null;
  signatureImage: string | null;
  signedIp: string | null;
  lines: QuotationLine[];
  branding: {
    companyName: string;
    logoUrl: string | null;
    phone?: string;
    email?: string;
    website?: string;
    address?: string;
    city?: string;
    country?: string;
    taxId?: string;
    lineItemDetailsLayout?: LineItemDetailsLayout;
  };
}

export default function PublicQuotationPage({
  params: paramsPromise,
}: {
  params: Promise<{ token: string }>;
}) {
  const params = use(paramsPromise);
  const token = params.token;

  const [data, setData] = useState<PublicQuotationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Signature Form State
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [isSigning, setIsSigning] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);
  const [signatureMode, setSignatureMode] = useState<SignatureMode>("draw");
  const [typedSignature, setTypedSignature] = useState("");
  const [uploadedSignature, setUploadedSignature] = useState<string | null>(null);
  const [uploadPreviewName, setUploadPreviewName] = useState<string | null>(null);

  // Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const publicQuotationBase = `/api/v1/public/quotations/${token}`;

  const fetchQuotation = async () => {
    try {
      setLoading(true);
      const res = await fetch(publicQuotationBase);
      if (!res.ok) {
        throw new Error("Quotation not found or link has expired");
      }
      const json = await res.json();
      setData(json);
      if (json.customerName) {
        setSignerName(json.customerName);
        setTypedSignature(json.customerName);
      }
      if (json.customerEmail) {
        setSignerEmail(json.customerEmail);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load quotation");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotation();
  }, [token]);

  // Setup canvas drawing (draw mode only)
  useEffect(() => {
    if (data?.signedBy || data?.state === "signed") return;
    if (signatureMode !== "draw") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      let clientX = 0;
      let clientY = 0;
      if ("touches" in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    const startDrawing = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      isDrawingRef.current = true;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e: MouseEvent | TouchEvent) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    };

    const stopDrawing = () => {
      isDrawingRef.current = false;
    };

    canvas.addEventListener("mousedown", startDrawing);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", stopDrawing);
    canvas.addEventListener("mouseleave", stopDrawing);

    canvas.addEventListener("touchstart", startDrawing, { passive: false });
    canvas.addEventListener("touchmove", draw, { passive: false });
    canvas.addEventListener("touchend", stopDrawing);

    return () => {
      canvas.removeEventListener("mousedown", startDrawing);
      canvas.removeEventListener("mousemove", draw);
      canvas.removeEventListener("mouseup", stopDrawing);
      canvas.removeEventListener("mouseleave", stopDrawing);

      canvas.removeEventListener("touchstart", startDrawing);
      canvas.removeEventListener("touchmove", draw);
      canvas.removeEventListener("touchend", stopDrawing);
    };
  }, [data, signatureMode]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const typedSignaturePreview =
    typedSignature.trim().length > 0
      ? textToSignatureDataUrl(typedSignature.trim())
      : null;

  async function handleUploadChange(file: File | null) {
    if (!file) {
      setUploadedSignature(null);
      setUploadPreviewName(null);
      return;
    }

    try {
      const dataUrl = await readSignatureUpload(file);
      setUploadedSignature(dataUrl);
      setUploadPreviewName(file.name);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not read signature file");
      setUploadedSignature(null);
      setUploadPreviewName(null);
    }
  }

  function resolveSignatureImage(): string | null {
    if (signatureMode === "draw") {
      const canvas = canvasRef.current;
      if (!canvas || isCanvasBlank(canvas)) {
        return null;
      }
      return canvas.toDataURL("image/png");
    }

    if (signatureMode === "type") {
      if (!typedSignature.trim()) {
        return null;
      }
      return textToSignatureDataUrl(typedSignature.trim());
    }

    return uploadedSignature;
  }

  const handleSignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signerName.trim()) {
      alert("Please enter your full name");
      return;
    }

    const signatureImage = resolveSignatureImage();
    if (!signatureImage) {
      if (signatureMode === "draw") {
        alert("Please draw your signature before submitting.");
      } else if (signatureMode === "type") {
        alert("Please type your signature before submitting.");
      } else {
        alert("Please upload a signature image before submitting.");
      }
      return;
    }

    try {
      setIsSigning(true);
      const res = await fetch(`${publicQuotationBase}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signedBy: signerName.trim(),
          signedEmail: signerEmail.trim() || undefined,
          signatureImage,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.message || "Failed to submit signature");
      }

      const updatedData = await res.json();
      setData(updatedData);
      setShowThankYou(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error submitting signature");
    } finally {
      setIsSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-600 font-medium">Loading quotation...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 shadow-sm border border-slate-200 text-center space-y-4">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
            !
          </div>
          <h2 className="text-xl font-bold text-slate-800">Invalid Link</h2>
          <p className="text-slate-600">{error || "Quotation not found."}</p>
        </div>
      </div>
    );
  }

  const isSigned = data.state === "signed" || Boolean(data.signedBy);
  const isPO = Boolean(data.customerReference);
  const pdfUrl = `${publicQuotationBase}/pdf`;
  const currencyCode = data.currencyCode?.trim() || "AED";
  const decimalPlaces = 2;

  const lineNetSubtotal = data.lines.reduce(
    (sum, line) => sum + Number(line.priceSubtotal ?? 0),
    0,
  );
  const deliveryFee = resolveDeliveryFee(
    lineNetSubtotal,
    data.deliveryFeeAmount,
    data.deliveryFeePercent,
  );
  const fmt = (amount: number | string) =>
    formatMoney(amount, currencyCode, decimalPlaces);
  const customerAddress = formatPostalAddressLines({
    street1: data.customerStreet1,
    street2: data.customerStreet2,
    city: data.customerCity,
    stateCode: data.customerState,
    zip: data.customerZip,
    countryCode: data.customerCountry,
  });
  const companyAddress = [
    data.branding.address,
    [data.branding.city, formatCountryLabel(data.branding.country)]
      .filter(Boolean)
      .join(", "),
  ].filter((value): value is string => Boolean(value));
  const quoteDateLabel = formatDocumentDate(data.quoteDate);
  const validityDateLabel = formatDocumentDate(data.validityDate);
  const trnLabel = formatTrnLabel(data.branding.taxId);
  const vatLabel = formatVatLabel(data.lines);
  const showSerialColumn = data.lines.some((line) =>
    Boolean(line.serialNumber?.trim()),
  );

  return (
    <div className="public-quote-page">
      <div className="public-quote-shell">
        <div className="public-quote-card">
          <header className="public-quote-hero">
            <div className="public-quote-hero__grid">
              <div className="public-quote-brand">
                {data.branding.logoUrl ? (
                  <img
                    src={data.branding.logoUrl}
                    alt={data.branding.companyName}
                    className="public-quote-brand__logo"
                  />
                ) : (
                  <div className="public-quote-brand__fallback">
                    {data.branding.companyName.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="public-quote-brand__name">
                    {data.branding.companyName}
                  </div>
                  <div className="public-quote-brand__meta" style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "2px" }}>
                    {companyAddress.map((line, idx) => (
                      <div key={idx}>{line}</div>
                    ))}
                    {trnLabel ? <div>{trnLabel}</div> : null}
                    {data.branding.phone ? <div>Phone: {data.branding.phone}</div> : null}
                    {data.branding.email ? <div>Email: {data.branding.email}</div> : null}
                  </div>
                </div>
              </div>

              <div className="public-quote-meta">
                <div className="public-quote-meta__label">Official quotation</div>
                <div className="public-quote-meta__number">#{data.number}</div>
                <div className="public-quote-meta__dates">
                  <span>Date {quoteDateLabel}</span>
                  {validityDateLabel ? (
                    <span> · Valid until {validityDateLabel}</span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="public-quote-status">
              {isSigned ? (
                <span className="public-quote-pill public-quote-pill--success">
                  Signed by {data.signedBy}
                </span>
              ) : isPO ? (
                <span className="public-quote-pill public-quote-pill--info">
                  PO authorized · {data.customerReference}
                </span>
              ) : (
                <span className="public-quote-pill public-quote-pill--warn">
                  Signature required to accept
                </span>
              )}
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="public-quote-btn public-quote-btn--ghost"
              >
                {isSigned ? "Download signed PDF" : "Preview PDF"}
              </a>
            </div>
          </header>

          <div className="public-quote-body">
            <div className="public-quote-parties">
              <section className="public-quote-party">
                <div className="public-quote-section-title">From</div>
                <div className="public-quote-party__name">
                  {data.branding.companyName}
                </div>
                {companyAddress.map((line, index) => (
                  <div key={`${index}-${line}`}>{line}</div>
                ))}
                {trnLabel ? <div>{trnLabel}</div> : null}
                {data.branding.phone ? <div>Phone: {data.branding.phone}</div> : null}
                {data.branding.email ? <div>Email: {data.branding.email}</div> : null}
                {data.branding.website ? (
                  <div>
                    Website:{" "}
                    <a href={data.branding.website} target="_blank" rel="noreferrer">
                      {data.branding.website}
                    </a>
                  </div>
                ) : null}
              </section>

              <section className="public-quote-party">
                <div className="public-quote-section-title">Quotation To:</div>
                <div className="public-quote-party__name">{data.customerName}</div>
                {customerAddress.length ? (
                  customerAddress.map((line, index) => (
                    <div key={`${index}-${line}`}>{line}</div>
                  ))
                ) : (
                  <div>No billing address provided</div>
                )}
                {data.customerTaxId ? <div>Tax ID: {data.customerTaxId}</div> : null}
                {data.customerEmail ? <div>Email: {data.customerEmail}</div> : null}
              </section>
            </div>

            <div className="public-quote-layout">
              <div>
                <div className="public-quote-table-wrap">
                  <table className="public-quote-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        {showSerialColumn ? <th>S/N</th> : null}
                        <th>Qty</th>
                        <th>Unit price</th>
                        <th>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lines.map((line) => {
                        const items = productDetailsLines(
                          line.description,
                          line.productDescription,
                        );
                        const commaDetails = formatProductDetailsInline(
                          line.description,
                          line.productDescription,
                        );
                        const useComma =
                          data.branding.lineItemDetailsLayout === "comma";
                        return (
                        <tr key={line.id}>
                          <td data-label="Description">
                            <div className="public-quote-line-title">
                              {line.description}
                            </div>
                            {useComma && commaDetails ? (
                              <div className="public-quote-line-details">
                                {commaDetails}
                              </div>
                            ) : items.length > 0 ? (
                              <ul className="line-item-details">
                                {items.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            ) : null}
                          </td>
                          {showSerialColumn ? (
                            <td data-label="S/N">
                              {line.serialNumber?.trim() || "—"}
                            </td>
                          ) : null}
                          <td data-label="Quantity">{formatQuantity(line.quantity)}</td>
                          <td data-label="Unit price">{fmt(line.unitPrice)}</td>
                          <td data-label="Subtotal">{fmt(line.priceSubtotal)}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {data.notes ? (
                  <div className="public-quote-notes">
                    <strong>Notes & terms</strong>
                    <div className="whitespace-pre-wrap">{data.notes}</div>
                  </div>
                ) : null}
              </div>

              <aside className="public-quote-totals">
                <div className="public-quote-totals__title">Price summary</div>
                {deliveryFee > 0 ? (
                  <>
                    <div className="public-quote-totals__row">
                      <span>Line subtotal</span>
                      <span>{fmt(lineNetSubtotal)}</span>
                    </div>
                    <div className="public-quote-totals__row">
                      <span>
                        Delivery fee
                        {data.deliveryFeePercent
                          ? ` (${data.deliveryFeePercent}%)`
                          : ""}
                      </span>
                      <span>+{fmt(deliveryFee)}</span>
                    </div>
                  </>
                ) : (
                  <div className="public-quote-totals__row">
                    <span>Untaxed amount</span>
                    <span>{fmt(data.amountUntaxed)}</span>
                  </div>
                )}
                <div className="public-quote-totals__row">
                  <span>{vatLabel}</span>
                  <span>+{fmt(data.amountTax)}</span>
                </div>
                <div className="public-quote-totals__row public-quote-totals__row--grand">
                  <span>Total</span>
                  <span className="public-quote-totals__grand-value">
                    {fmt(data.amountTotal)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  {data.lines.length} line item
                  {data.lines.length === 1 ? "" : "s"}
                </p>
              </aside>
            </div>
          </div>

          <section className="public-quote-sign">
            {isSigned ? (
              <div className="space-y-4">
                <div className="public-quote-approved-banner">
                  <div className="public-quote-approved-banner__title">
                    Quotation approved & saved
                  </div>
                  <div className="public-quote-approved-banner__meta">
                    Signed by {data.signedBy}
                    {data.signedOn
                      ? ` on ${new Date(data.signedOn).toLocaleString()}`
                      : ""}
                    . This page is your approval record — bookmark it or download
                    the signed PDF below.
                  </div>
                </div>

                <div className="public-quote-approved-record">
                  <div className="public-quote-approved-record__grid">
                    <div>
                      <span className="text-slate-400 text-xs block">Signer</span>
                      <strong>{data.signedBy}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 text-xs block">Email</span>
                      <strong>{data.signedEmail ?? data.customerEmail ?? "—"}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 text-xs block">Approved total</span>
                      <strong>{fmt(data.amountTotal)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 text-xs block">Reference</span>
                      <strong>{data.signedIp || "Recorded"}</strong>
                    </div>
                  </div>

                  {data.signatureImage ? (
                    <div className="public-quote-approved-record__signature">
                      <span className="text-slate-400 text-xs block">
                        Saved signature
                      </span>
                      <img
                        src={data.signatureImage}
                        alt="Customer signature"
                        className="public-quote-approved-record__signature-img"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="public-quote-form-actions">
                  <button
                    type="button"
                    className="public-quote-btn public-quote-btn--success px-5 py-2.5 text-sm"
                    onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")}
                  >
                    Download approved PDF
                  </button>
                </div>
              </div>
            ) : isPO ? (
              <div>
                <div className="public-quote-sign__title">PO authorization</div>
                <p className="public-quote-sign__hint">
                  This quotation is covered by purchase order{" "}
                  <strong>{data.customerReference}</strong>. No online signature
                  is required.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSignSubmit}>
                <div className="public-quote-sign__title">Accept & sign</div>
                <p className="public-quote-sign__hint">
                  Review the quotation above, then sign to confirm acceptance.
                </p>

                <div className="public-quote-form-grid">
                  <div>
                    <label className="public-quote-field" htmlFor="signer-name">
                      Full name *
                    </label>
                    <input
                      id="signer-name"
                      type="text"
                      required
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      className="public-quote-input"
                      placeholder="Your full name"
                    />
                  </div>
                  <div>
                    <label className="public-quote-field" htmlFor="signer-email">
                      Email
                    </label>
                    <input
                      id="signer-email"
                      type="email"
                      value={signerEmail}
                      onChange={(e) => setSignerEmail(e.target.value)}
                      className="public-quote-input"
                      placeholder="your@email.com"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="public-quote-field">Signature method *</label>
                  <div className="public-quote-signature-tabs">
                    <button
                      type="button"
                      className={`public-quote-signature-tab${signatureMode === "draw" ? " public-quote-signature-tab--active" : ""}`}
                      onClick={() => setSignatureMode("draw")}
                    >
                      Draw
                    </button>
                    <button
                      type="button"
                      className={`public-quote-signature-tab${signatureMode === "type" ? " public-quote-signature-tab--active" : ""}`}
                      onClick={() => {
                        setSignatureMode("type");
                        if (!typedSignature.trim()) {
                          setTypedSignature(signerName);
                        }
                      }}
                    >
                      Type
                    </button>
                    <button
                      type="button"
                      className={`public-quote-signature-tab${signatureMode === "upload" ? " public-quote-signature-tab--active" : ""}`}
                      onClick={() => setSignatureMode("upload")}
                    >
                      Upload image
                    </button>
                  </div>

                  {signatureMode === "draw" ? (
                    <>
                      <div className="flex justify-end mt-2">
                        <button
                          type="button"
                          onClick={clearCanvas}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                        >
                          Clear drawing
                        </button>
                      </div>
                      <div className="public-quote-canvas-wrap mt-2">
                        <canvas ref={canvasRef} id="signature-canvas" width={600} height={144} />
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5">
                        Draw with your mouse or finger on a phone or tablet.
                      </p>
                    </>
                  ) : null}

                  {signatureMode === "type" ? (
                    <>
                      <input
                        id="typed-signature"
                        type="text"
                        value={typedSignature}
                        onChange={(e) => setTypedSignature(e.target.value)}
                        className="public-quote-input mt-2"
                        placeholder="Type your full name as signature"
                      />
                      {typedSignaturePreview ? (
                        <div className="public-quote-signature-preview">
                          <img src={typedSignaturePreview} alt="Typed signature preview" />
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {signatureMode === "upload" ? (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) =>
                          void handleUploadChange(e.target.files?.[0] ?? null)
                        }
                      />
                      <div className="mt-2 flex flex-wrap gap-2 items-center">
                        <button
                          type="button"
                          className="public-quote-btn public-quote-btn--primary text-xs"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Choose signature image
                        </button>
                        {uploadPreviewName ? (
                          <span className="text-xs text-slate-500">
                            {uploadPreviewName}
                          </span>
                        ) : null}
                      </div>
                      {uploadedSignature ? (
                        <div className="public-quote-signature-preview">
                          <img src={uploadedSignature} alt="Uploaded signature preview" />
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 mt-1.5">
                          PNG or JPG, up to 2 MB.
                        </p>
                      )}
                    </>
                  ) : null}
                </div>

                <div className="public-quote-form-actions">
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="public-quote-link"
                  >
                    Download PDF copy
                  </a>
                  <button
                    type="submit"
                    disabled={isSigning}
                    className="public-quote-btn public-quote-btn--primary px-6 py-2.5 text-sm disabled:opacity-50"
                  >
                    {isSigning ? "Submitting…" : "Accept & sign quotation"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>
      {showThankYou ? (
        <div className="public-quote-modal-backdrop" role="presentation">
          <div
            aria-labelledby="approval-thank-you-title"
            aria-modal="true"
            className="public-quote-modal"
            role="dialog"
          >
            <div className="public-quote-modal__check" aria-hidden="true">✓</div>
            <h2 id="approval-thank-you-title">
              Thank you, {data.signedBy ?? signerName}
            </h2>
            <p>
              Your signed response for quotation <strong>{data.number}</strong> has
              been received by {data.branding.companyName}. No further action is
              required right now.
            </p>
            <p className="public-quote-modal__hint">
              You can keep this page as your approval record or download a signed
              PDF for your files.
            </p>
            <div className="public-quote-modal__actions">
              <button
                type="button"
                className="public-quote-btn public-quote-btn--success px-5 py-2.5 text-sm"
                onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")}
              >
                Download signed PDF
              </button>
              <button
                type="button"
                className="public-quote-btn public-quote-btn--ghost px-5 py-2.5 text-sm"
                onClick={() => setShowThankYou(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
