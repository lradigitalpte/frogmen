export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!,
  );
}

export function textToHtmlParagraphs(text: string): string {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length === 0) {
    return "";
  }

  return blocks
    .map((block) => {
      const lines = escapeHtml(block).replace(/\n/g, "<br />");
      return `<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${lines}</p>`;
    })
    .join("");
}

export interface BrandedEmailInput {
  brandName?: string;
  logoUrl?: string | null;
  title: string;
  bodyText: string;
  bodyHtml?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  extraHtml?: string;
}

export function renderBrandedEmail(input: BrandedEmailInput): {
  text: string;
  html: string;
} {
  const safeTitle = escapeHtml(input.title);
  const safeBrandName = escapeHtml(input.brandName?.trim() || "FrogmenDash");
  const safeLogoUrl = input.logoUrl ? escapeHtml(input.logoUrl) : "";
  const bodyHtml =
    input.bodyHtml?.trim() || textToHtmlParagraphs(input.bodyText);
  const safeFooter = input.footerNote ? escapeHtml(input.footerNote) : "";
  const safeCtaLabel = input.ctaLabel ? escapeHtml(input.ctaLabel) : "";
  const safeCtaUrl = input.ctaUrl ? escapeHtml(input.ctaUrl) : "";

  const ctaText =
    input.ctaLabel && input.ctaUrl
      ? `\n\n${input.ctaLabel}: ${input.ctaUrl}`
      : "";
  const text = `${input.bodyText}${ctaText}${
    input.footerNote ? `\n\n${input.footerNote}` : ""
  }`.trim();

  const ctaHtml =
    input.ctaLabel && input.ctaUrl
      ? `<a href="${safeCtaUrl}" style="display:inline-block;margin:24px 0 18px;padding:12px 20px;border-radius:9px;background:#059669;color:#fff;text-decoration:none;font-weight:700">${safeCtaLabel}</a>`
      : "";

  const footerHtml = input.footerNote
    ? `<p style="margin:0;color:#66736d;font-size:13px">${safeFooter}</p>`
    : "";

  const html = `
    <div style="background:#f4f7f5;padding:32px 16px;font-family:Inter,Arial,sans-serif;color:#17201c">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dfe7e3;border-radius:16px;overflow:hidden">
        <div style="padding:28px 30px;background:linear-gradient(135deg,#047857,#10b981);color:#fff">
          ${safeLogoUrl ? `<img src="${safeLogoUrl}" alt="${safeBrandName}" style="display:block;max-width:150px;max-height:54px;margin:0 0 14px" />` : ""}
          <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.85">${safeBrandName}</div>
          <h1 style="margin:10px 0 0;font-size:25px;line-height:1.25">${safeTitle}</h1>
        </div>
        <div style="padding:30px">
          ${bodyHtml}
          ${input.extraHtml ?? ""}
          ${ctaHtml}
          ${footerHtml}
        </div>
      </div>
    </div>
  `.trim();

  return { text, html };
}
