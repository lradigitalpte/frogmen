import { formatAppDate } from "../format-date";
import { escapeHtml, textToHtmlParagraphs } from "./email-layout";
import type { EmailDesignConfig } from "../schemas/email-marketing";

export interface RecipientMergeData {
  name?: string | null;
  firstName?: string | null;
  company?: string | null;
  email?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  source?: string | null;
  unsubscribeUrl?: string | null;
  trackingPixelUrl?: string | null;
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Interpolates {{variable}} tags with recipient or context data.
 */
export function interpolateVariables(
  template: string,
  data: RecipientMergeData,
): string {
  if (!template) return "";

  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (match, key) => {
    // Check known variations
    if (key === "name") {
      return escapeHtml(data.name || data.firstName || "there");
    }
    if (key === "first_name" || key === "firstName") {
      return escapeHtml(data.firstName || data.name?.split(" ")[0] || "there");
    }
    if (key === "company") {
      return escapeHtml(data.company || "your organization");
    }
    if (key === "email") {
      return escapeHtml(data.email || "");
    }
    if (key === "job_title" || key === "jobTitle") {
      return escapeHtml(data.jobTitle || "");
    }
    if (key === "unsubscribe_url" || key === "unsubscribeUrl") {
      return data.unsubscribeUrl || "#";
    }
    if (key === "current_year" || key === "year") {
      return new Date().getFullYear().toString();
    }

    const value = data[key];
    if (value !== undefined && value !== null) {
      return escapeHtml(String(value));
    }
    return match; // Keep placeholder if not provided
  });
}

export interface FeatureHighlightCard {
  badge?: string;
  title: string;
  description: string;
}

export interface StructuredEmailContent {
  greeting?: string;
  introParagraphs?: string;
  featureCards?: FeatureHighlightCard[];
  closingParagraphs?: string;
  signOff?: string;
}

/**
 * Converts structured visual fields into clean, responsive email body HTML.
 */
export function buildMarketingEmailBodyHtml(content: StructuredEmailContent): string {
  const parts: string[] = [];

  if (content.greeting?.trim()) {
    parts.push(`<p>${escapeHtml(content.greeting.trim())}</p>`);
  }

  if (content.introParagraphs?.trim()) {
    const blocks = content.introParagraphs
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean);
    for (const block of blocks) {
      const formatted = escapeHtml(block).replace(/\n/g, "<br />");
      parts.push(`<p>${formatted}</p>`);
    }
  }

  if (content.featureCards && content.featureCards.length > 0) {
    for (const card of content.featureCards) {
      if (!card.title.trim() && !card.description.trim()) continue;
      const badgeHtml = card.badge?.trim()
        ? `\n  <div class="badge">${escapeHtml(card.badge.trim())}</div>`
        : "";
      const titleHtml = card.title.trim()
        ? `\n  <h3 style="margin-top:0;">${escapeHtml(card.title.trim())}</h3>`
        : "";
      const descHtml = card.description.trim()
        ? `\n  <p style="margin-bottom:0;">${escapeHtml(card.description.trim()).replace(/\n/g, "<br />")}</p>`
        : "";

      parts.push(`<div class="feature-card">${badgeHtml}${titleHtml}${descHtml}\n</div>`);
    }
  }

  if (content.closingParagraphs?.trim()) {
    const blocks = content.closingParagraphs
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean);
    for (const block of blocks) {
      const formatted = escapeHtml(block).replace(/\n/g, "<br />");
      parts.push(`<p>${formatted}</p>`);
    }
  }

  if (content.signOff?.trim()) {
    const lines = escapeHtml(content.signOff.trim()).replace(/\n/g, "<br />");
    parts.push(`<p>${lines}</p>`);
  }

  return parts.join("\n\n");
}

/**
 * Intelligent helper to parse raw HTML into structured editor fields.
 */
export function parseMarketingEmailBodyHtml(html: string): StructuredEmailContent {
  if (!html || !html.trim()) {
    return {
      greeting: "Hello {{first_name}},",
      introParagraphs: "",
      featureCards: [],
      closingParagraphs: "",
      signOff: "",
    };
  }

  // Feature cards contain a nested badge <div>, so a lazy regex would stop at
  // the badge's closing tag. Walk the markup and balance <div> depth instead.
  const cards: FeatureHighlightCard[] = [];
  const cardRanges: Array<{ start: number; end: number; inner: string }> = [];
  const cardOpen = /<div class="feature-card"[^>]*>/gi;
  let openMatch: RegExpExecArray | null;

  while ((openMatch = cardOpen.exec(html)) !== null) {
    const innerStart = openMatch.index + openMatch[0].length;
    const tagRegex = /<\/?div\b[^>]*>/gi;
    tagRegex.lastIndex = innerStart;
    let depth = 1;
    let tag: RegExpExecArray | null;
    let end = html.length;
    let innerEnd = html.length;
    while ((tag = tagRegex.exec(html)) !== null) {
      depth += tag[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        innerEnd = tag.index;
        end = tag.index + tag[0].length;
        break;
      }
    }
    cardRanges.push({ start: openMatch.index, end, inner: html.slice(innerStart, innerEnd) });
    cardOpen.lastIndex = end;
  }

  for (const { inner } of cardRanges) {
    const badgeMatch = /<div class="badge"[^>]*>([\s\S]*?)<\/div>/i.exec(inner);
    const titleMatch = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(inner);
    const descMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(inner);

    cards.push({
      badge: badgeMatch ? badgeMatch[1].replace(/<[^>]+>/g, "").trim() : "",
      title: titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "",
      description: descMatch
        ? descMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim()
        : "",
    });
  }

  // Text before the first card is the intro; anything after the first card
  // (including text between cards) becomes the closing.
  const beforeText = cardRanges.length ? html.slice(0, cardRanges[0].start) : html;
  const afterText = cardRanges
    .map((range, index) => html.slice(range.end, cardRanges[index + 1]?.start ?? html.length))
    .join("\n");

  // Extract <p> tags from beforeText
  const beforeParagraphs = (beforeText.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [])
    .map((p) =>
      p
        .replace(/<p[^>]*>/i, "")
        .replace(/<\/p>/i, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .trim(),
    )
    .filter(Boolean);

  let greeting = "";
  let introList: string[] = [];

  if (beforeParagraphs.length > 0) {
    const first = beforeParagraphs[0];
    if (/^(Hello|Hi|Dear|Hey|Greetings)/i.test(first) && first.length < 80) {
      greeting = first;
      introList = beforeParagraphs.slice(1);
    } else {
      introList = beforeParagraphs;
    }
  }

  // Extract <p> tags from afterText
  const afterParagraphs = (afterText.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [])
    .map((p) =>
      p
        .replace(/<p[^>]*>/i, "")
        .replace(/<\/p>/i, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .trim(),
    )
    .filter(Boolean);

  let closingParagraphs = "";
  let signOff = "";

  if (afterParagraphs.length > 0) {
    const last = afterParagraphs[afterParagraphs.length - 1];
    if (/^(Best regards|Regards|Warm regards|Sincerely|Cheers|Thanks|Thank you)/i.test(last)) {
      signOff = last;
      closingParagraphs = afterParagraphs.slice(0, -1).join("\n\n");
    } else {
      closingParagraphs = afterParagraphs.join("\n\n");
    }
  }

  return {
    greeting: greeting || "Hello {{first_name}},",
    introParagraphs: introList.join("\n\n"),
    featureCards: cards,
    closingParagraphs,
    signOff,
  };
}

export interface RenderMarketingEmailOptions {
  subject: string;
  previewText?: string;
  bodyHtml?: string;
  bodyText?: string;
  design?: Partial<EmailDesignConfig>;
  mergeData?: RecipientMergeData;
  campaignId?: string;
  recipientToken?: string;
  forceTheme?: "light" | "dark";
}

/** Blend a hex colour towards another (0 = a, 1 = b). Used for tints. */
function mixHex(a: string, b: string, amount: number): string {
  const parse = (hex: string) => {
    const clean = hex.replace("#", "");
    const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0");
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
  };
  const ca = parse(a);
  const cb = parse(b);
  return `#${ca
    .map((v, i) => Math.round(v + (cb[i] - v) * amount).toString(16).padStart(2, "0"))
    .join("")}`;
}

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";

/**
 * Renders a marketing email in a calm, editorial style: a quiet wordmark,
 * one confident headline, generous spacing, hairline-separated highlights and
 * a single clear button. Works in light and dark inboxes and on phones.
 *
 * Only `primaryColor` drives colour; neutrals are fixed so every campaign
 * looks considered regardless of older saved colour settings.
 */
export function renderMarketingEmailHtml(options: RenderMarketingEmailOptions): {
  html: string;
  text: string;
} {
  const isDark = options.forceTheme === "dark";

  const design = {
    primaryColor: /^#[0-9a-f]{3,8}$/i.test(options.design?.primaryColor || "")
      ? (options.design?.primaryColor as string)
      : "#1f3d35",
    showLogo: options.design?.showLogo !== false,
    logoUrl: options.design?.logoUrl || "",
    brandName: options.design?.brandName || "Frogmen Technologies",
    headerStyle: options.design?.headerStyle || "banner",
    ctaLabel: options.design?.ctaLabel,
    ctaUrl: options.design?.ctaUrl,
    ctaStyle: options.design?.ctaStyle || "rounded",
    footerText:
      options.design?.footerText ||
      "You are receiving this email because you are in contact with our team.",
    companyAddress: options.design?.companyAddress || "Frogmen Technologies Pte Ltd",
    showUnsubscribe: options.design?.showUnsubscribe !== false,
  };

  // Fixed, refined neutrals (light / dark)
  const light = {
    page: "#f4f4f1",
    card: "#ffffff",
    text: "#3d4643",
    heading: "#111816",
    muted: "#7b8581",
    rule: "#e7e7e2",
  };
  const dark = {
    page: "#0b0f0e",
    card: "#131a18",
    text: "#c3cbc8",
    heading: "#f2f5f4",
    muted: "#7f8a86",
    rule: "#26302d",
  };
  const p = isDark ? dark : light;
  const accent = design.primaryColor;
  const accentText = isDark ? mixHex(accent, "#ffffff", 0.55) : accent;
  const darkAccentText = mixHex(accent, "#ffffff", 0.55);
  const buttonBg = isDark ? darkAccentText : accent;
  const buttonFg = isDark ? "#0b0f0e" : "#ffffff";

  const mergeData = options.mergeData || {};
  const previewText = options.previewText ? interpolateVariables(options.previewText, mergeData) : "";
  const interpolatedSubject = interpolateVariables(options.subject, mergeData);
  const brand = escapeHtml(design.brandName);

  // Body: interpolate, then inline the editorial styles so they survive
  // clients that strip <style> blocks.
  let rawBodyHtml = options.bodyHtml?.trim() || "";
  if (!rawBodyHtml && options.bodyText) {
    rawBodyHtml = textToHtmlParagraphs(options.bodyText);
  }
  const pStyle = `margin:0 0 18px;font-size:16px;line-height:1.7;color:${p.text};`;
  const bodyContent = interpolateVariables(rawBodyHtml, mergeData)
    .replace(
      /<div class="feature-card"[^>]*>/gi,
      `<div class="feature-card" style="margin:30px 0;padding:24px 0 0;border-top:1px solid ${p.rule};">`,
    )
    .replace(
      /<div class="badge"[^>]*>/gi,
      `<div class="badge" style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${accentText};">`,
    )
    .replace(
      /<h3[^>]*>/gi,
      `<h3 style="margin:0 0 8px;font-size:20px;line-height:1.3;font-weight:700;letter-spacing:-0.015em;color:${p.heading};">`,
    )
    .replace(
      /<h2[^>]*>/gi,
      `<h2 style="margin:32px 0 12px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.02em;color:${p.heading};">`,
    )
    .replace(/<p style="margin-bottom:0;">/gi, `<p class="card-text" style="margin:0 0 6px;font-size:15px;line-height:1.65;color:${p.text};">`)
    .replace(/<p>/gi, `<p style="${pStyle}">`)
    .replace(/<strong>/gi, `<strong style="color:${p.heading};font-weight:650;">`)
    .replace(/<a href=/gi, `<a style="color:${accentText};text-decoration:underline;" href=`);

  // Button
  let ctaHtml = "";
  if (design.ctaLabel && design.ctaUrl) {
    const url = interpolateVariables(design.ctaUrl, mergeData);
    const label = escapeHtml(interpolateVariables(design.ctaLabel, mergeData));
    const radius = design.ctaStyle === "rounded" ? "999px" : design.ctaStyle === "outline" ? "8px" : "6px";
    const outline = design.ctaStyle === "outline";
    const look = outline
      ? `background:transparent;color:${accentText};border:1.5px solid ${accentText};`
      : `background:${buttonBg};color:${buttonFg};border:1.5px solid ${buttonBg};`;
    ctaHtml = `
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:34px 0 6px;">
        <tr>
          <td style="border-radius:${radius};${outline ? "" : `background:${buttonBg};`}" class="${outline ? "" : "cta-cell"}">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:50px;v-text-anchor:middle;width:240px;" arcsize="${design.ctaStyle === "rounded" ? "50%" : "12%"}" ${outline ? `strokecolor="${accent}" fill="f"` : `stroke="f" fillcolor="${accent}"`}>
              <w:anchorlock/>
              <center style="color:${outline ? accent : "#ffffff"};font-family:sans-serif;font-size:15px;font-weight:bold;">${label}</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${url}" class="email-button${outline ? " is-outline" : ""}" style="display:inline-block;padding:15px 30px;border-radius:${radius};${look}font-family:${FONT_STACK};font-size:15px;font-weight:600;line-height:1;text-decoration:none;letter-spacing:0.005em;">${label}&nbsp;&nbsp;&rarr;</a>
            <!--<![endif]-->
          </td>
        </tr>
      </table>
    `;
  }

  // Wordmark row that sits above the card
  const logoOrWordmark =
    design.showLogo && design.logoUrl
      ? `<img src="${design.logoUrl}" alt="${brand}" style="display:block;max-width:140px;max-height:36px;border:0;" />`
      : `<span style="display:inline-block;width:9px;height:9px;border-radius:9px;background:${accent};margin-right:9px;vertical-align:middle;"></span><span class="wordmark" style="font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${p.heading};vertical-align:middle;">${brand}</span>`;
  const dateLabel = escapeHtml(formatAppDate(new Date().toISOString().slice(0, 10)));

  // Header inside the card
  let headerHtml = "";
  if (design.headerStyle === "banner") {
    headerHtml = `
      <tr>
        <td class="email-hero" style="padding:52px 44px 48px;background:${accent};background-image:radial-gradient(120% 140% at 100% 0%, rgba(255,255,255,0.16), rgba(255,255,255,0) 55%);">
          <h1 class="email-subject-heading hero-heading" style="margin:0;font-size:34px;line-height:1.15;font-weight:700;letter-spacing:-0.025em;color:#ffffff;">${escapeHtml(interpolatedSubject)}</h1>
          ${previewText ? `<p class="hero-dek" style="margin:16px 0 0;max-width:440px;font-size:17px;line-height:1.55;color:rgba(255,255,255,0.78);">${escapeHtml(previewText)}</p>` : ""}
        </td>
      </tr>`;
  } else if (design.headerStyle === "centered") {
    headerHtml = `
      <tr>
        <td class="email-head" style="padding:52px 44px 8px;text-align:center;">
          <h1 class="email-subject-heading" style="margin:0 auto;max-width:480px;font-size:32px;line-height:1.18;font-weight:700;letter-spacing:-0.025em;color:${p.heading};">${escapeHtml(interpolatedSubject)}</h1>
          ${previewText ? `<p class="dek" style="margin:14px auto 0;max-width:440px;font-size:17px;line-height:1.55;color:${p.muted};">${escapeHtml(previewText)}</p>` : ""}
          <div style="width:44px;height:3px;margin:26px auto 0;border-radius:3px;background:${accent};font-size:0;line-height:0;">&nbsp;</div>
        </td>
      </tr>`;
  } else {
    // Minimal letterhead: no headline — reads like a personal letter
    headerHtml = `
      <tr>
        <td class="email-head" style="padding:30px 44px 0;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td class="rule" style="padding:0 0 18px;border-bottom:1px solid ${p.rule};font-size:13px;color:${p.muted};">${dateLabel}</td>
            </tr>
          </table>
        </td>
      </tr>`;
  }

  const bodyTopPadding = design.headerStyle === "minimal" ? "30px" : "40px";

  // Footer sits outside the card
  const unsubscribeUrl = mergeData.unsubscribeUrl || "#";
  const footerText = escapeHtml(interpolateVariables(design.footerText, mergeData));
  const footerHtml = `
    <tr>
      <td class="email-footer" style="padding:30px 24px 8px;text-align:center;font-family:${FONT_STACK};font-size:12px;line-height:1.7;color:${p.muted};">
        <p class="foot" style="margin:0 0 6px;font-size:12px;line-height:1.7;color:${p.muted};">${footerText}</p>
        <p class="foot" style="margin:0 0 14px;font-size:12px;line-height:1.7;color:${p.muted};">${escapeHtml(design.companyAddress)}</p>
        ${
          design.showUnsubscribe
            ? `<p class="foot" style="margin:0;font-size:12px;line-height:1.7;color:${p.muted};"><a href="${unsubscribeUrl}" class="unsubscribe-link" style="color:${p.muted};text-decoration:underline;">Unsubscribe</a>&nbsp;&nbsp;&middot;&nbsp;&nbsp;<a href="#" class="footer-pref-link" style="color:${p.muted};text-decoration:underline;">Email preferences</a></p>`
            : ""
        }
      </td>
    </tr>`;

  const trackingPixelHtml = mergeData.trackingPixelUrl
    ? `<img src="${mergeData.trackingPixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;max-height:1px;max-width:1px;opacity:0;border:0;" />`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(interpolatedSubject)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; font-family: ${FONT_STACK}; }
    ul, ol { margin: 0 0 18px; padding-left: 22px; font-size: 16px; line-height: 1.7; color: ${p.text}; }
    li { margin-bottom: 6px; }
    .email-button:hover { opacity: 0.9; }

    @media (prefers-color-scheme: dark) {
      body, .email-bg { background-color: ${dark.page} !important; }
      .email-card { background-color: ${dark.card} !important; border-color: ${dark.rule} !important; }
      .email-body p, .email-body li, .email-body ul, .email-body ol, .card-text { color: ${dark.text} !important; }
      h1, h2, h3, .email-subject-heading, strong, .wordmark { color: ${dark.heading} !important; }
      .hero-heading { color: #ffffff !important; }
      .badge, .email-body a:not(.email-button) { color: ${darkAccentText} !important; }
      .feature-card, .rule { border-color: ${dark.rule} !important; }
      .email-footer, .foot, .unsubscribe-link, .footer-pref-link, .rule { color: ${dark.muted} !important; }
      .email-button.is-outline { color: ${darkAccentText} !important; border-color: ${darkAccentText} !important; }
      .cta-cell, .email-button:not(.is-outline) { background-color: ${darkAccentText} !important; border-color: ${darkAccentText} !important; color: #0b0f0e !important; }
      .dek { color: ${dark.muted} !important; }
    }
    @media only screen and (max-width: 620px) {
      .email-container { padding: 20px 10px !important; }
      .email-hero { padding: 36px 24px 34px !important; }
      .email-head { padding-left: 24px !important; padding-right: 24px !important; }
      .email-body { padding: 30px 24px 34px !important; }
      .email-subject-heading { font-size: 27px !important; }
      .email-button { display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body class="email-bg" style="margin:0;padding:0;background-color:${p.page};font-family:${FONT_STACK};">
  ${
    previewText
      ? `<div style="display:none;font-size:1px;color:${p.page};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(previewText)}&#847; &zwnj; &nbsp; &#8199; &shy; &#847; &zwnj; &nbsp; &#8199; &shy;</div>`
      : ""
  }
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-bg" style="background-color:${p.page};">
    <tr>
      <td align="center" style="padding:36px 16px 40px;" class="email-container">
        <!--[if (gte mso 9)|(IE)]>
        <table align="center" border="0" cellspacing="0" cellpadding="0" width="600"><tr><td align="center" valign="top" width="600">
        <![endif]-->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;">
          <!-- Wordmark -->
          <tr>
            <td style="padding:0 6px 18px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="left">${logoOrWordmark}</td>
                  <td align="right" class="foot" style="font-size:12px;color:${p.muted};">${design.headerStyle === "minimal" ? "" : dateLabel}</td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-card" style="background-color:${p.card};border:1px solid ${p.rule};border-radius:14px;overflow:hidden;">
                ${headerHtml}
                <tr>
                  <td class="email-body" style="padding:${bodyTopPadding} 44px 44px;font-family:${FONT_STACK};font-size:16px;line-height:1.7;color:${p.text};">
                    ${bodyContent}
                    ${ctaHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${footerHtml}
        </table>
        <!--[if (gte mso 9)|(IE)]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
  </table>
  ${trackingPixelHtml}
</body>
</html>`.trim();

  const plainBody = (options.bodyText || interpolateVariables(rawBodyHtml, mergeData))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const text = `${interpolatedSubject}\n\n${plainBody}\n\n${
    design.ctaLabel && design.ctaUrl
      ? `${design.ctaLabel}: ${interpolateVariables(design.ctaUrl, mergeData)}\n\n`
      : ""
  }${design.footerText}\n${design.companyAddress}${
    design.showUnsubscribe ? `\nUnsubscribe: ${unsubscribeUrl}` : ""
  }`.trim();

  return { html, text };
}

/**
 * Built-in Preset Templates
 */
export interface SystemPresetTemplate {
  id: string;
  name: string;
  category: "announcement" | "promotion" | "newsletter" | "onboarding" | "outreach" | "custom";
  description: string;
  subject: string;
  previewText: string;
  designConfig: EmailDesignConfig;
  bodyHtml: string;
}

/** Shared neutral settings for every preset; each overrides what it needs. */
function presetDesign(overrides: Partial<EmailDesignConfig>): EmailDesignConfig {
  return {
    primaryColor: "#1f3d35",
    backgroundColor: "#f4f4f1",
    darkBackgroundColor: "#0b0f0e",
    cardBackgroundColor: "#ffffff",
    darkCardBackgroundColor: "#131a18",
    textColor: "#3d4643",
    darkTextColor: "#c3cbc8",
    headingColor: "#111816",
    darkHeadingColor: "#f2f5f4",
    showLogo: true,
    brandName: "Frogmen Technologies",
    headerStyle: "banner",
    ctaStyle: "rounded",
    footerText: "You're receiving this because you work with Frogmen Technologies.",
    companyAddress: "Frogmen Technologies Pte Ltd · Singapore",
    showUnsubscribe: true,
    ...overrides,
  } as EmailDesignConfig;
}

export const SYSTEM_PRESET_TEMPLATES: SystemPresetTemplate[] = [
  {
    id: "preset-product-announcement",
    name: "Product & Feature Launch",
    category: "announcement",
    description: "A confident announcement: bold colour headline, two highlights and one clear next step.",
    subject: "Inspection reports, now in hours — not weeks",
    previewText: "Two upgrades that change how {{company}} receives inspection results.",
    designConfig: presetDesign({
      primaryColor: "#1f3d35",
      headerStyle: "banner",
      ctaLabel: "See what's new",
      ctaUrl: "https://frogmen.app/dashboard",
      footerText: "You're receiving this update as a partner of Frogmen Technologies.",
    }),
    bodyHtml: `
<p>Hello {{first_name}},</p>

<p>Over the last quarter we rebuilt how inspection results reach you. The short version: {{company}} now gets clearer findings, much sooner, in one place.</p>

<div class="feature-card">
  <div class="badge">01 — Reporting</div>
  <h3 style="margin-top:0;">Reports within 24 hours of the dive</h3>
  <p style="margin-bottom:0;">Findings are tagged on site and reviewed the same day, so you're no longer waiting weeks for a PDF.</p>
</div>

<div class="feature-card">
  <div class="badge">02 — Visibility</div>
  <h3 style="margin-top:0;">Every asset, one live record</h3>
  <p style="margin-bottom:0;">Photos, observations and history for each structure live together — easy to share with your engineers and auditors.</p>
</div>

<p>Both are already switched on for your account. Have a look, and simply reply if you'd like a walkthrough.</p>
    `.trim(),
  },
  {
    id: "preset-promotional-offer",
    name: "Exclusive Partner Offer",
    category: "promotion",
    description: "A calm, premium offer: one headline number, the terms in plain words, a deadline.",
    subject: "15% off your next inspection, {{first_name}}",
    previewText: "A thank-you for {{company}} — valid on bookings until the end of the month.",
    designConfig: presetDesign({
      primaryColor: "#0f2a44",
      headerStyle: "banner",
      ctaLabel: "Book an inspection",
      ctaUrl: "https://frogmen.app/dashboard/sales/quotations",
      footerText: "Offer applies to new bookings confirmed this month. Terms apply.",
    }),
    bodyHtml: `
<p>Hi {{first_name}},</p>

<p>Thank you for trusting us with {{company}}'s assets this year. As a small thank-you, we're holding a preferential rate for your next piece of work.</p>

<div class="feature-card">
  <div class="badge">Partner rate · Until month end</div>
  <h3 style="margin-top:0;">15% off ROV inspections and service contracts</h3>
  <p style="margin-bottom:0;">Applies to any package confirmed before the end of the month, including scheduled maintenance and new deployments.</p>
</div>

<p>Bookings made under this offer also get priority scheduling with our engineering team.</p>
    `.trim(),
  },
  {
    id: "preset-newsletter-digest",
    name: "Industry Insights & Digest",
    category: "newsletter",
    description: "An editorial newsletter with a centred headline and numbered stories.",
    subject: "The Frogmen Dispatch — November",
    previewText: "Faster turnarounds, new integrity standards, and what they mean for {{company}}.",
    designConfig: presetDesign({
      primaryColor: "#1e3a5f",
      headerStyle: "centered",
      ctaLabel: "Read the full issue",
      ctaUrl: "https://frogmen.app",
      footerText: "You're receiving the Frogmen Dispatch, our monthly technical newsletter.",
    }),
    bodyHtml: `
<p>Dear {{name}},</p>

<p>Here's what our engineers learned in the field this month — and what it means for the assets you look after.</p>

<div class="feature-card">
  <div class="badge">01 — In the field</div>
  <h3 style="margin-top:0;">Inspection turnaround down 40%</h3>
  <p style="margin-bottom:0;">On-site defect tagging cut the time from dive to signed report across our latest offshore campaigns.</p>
</div>

<div class="feature-card">
  <div class="badge">02 — Standards</div>
  <h3 style="margin-top:0;">New integrity guidelines take effect next quarter</h3>
  <p style="margin-bottom:0;">A short summary of what changes for marine asset inspections, and how to prepare your schedule.</p>
</div>

<p>Thank you for reading. Reply any time with questions or topics you'd like us to cover.</p>
    `.trim(),
  },
  {
    id: "preset-welcome-onboarding",
    name: "Customer Onboarding & Welcome",
    category: "onboarding",
    description: "A warm welcome with two simple first steps.",
    subject: "Welcome to Frogmen, {{first_name}}",
    previewText: "Two quick steps to get {{company}} set up.",
    designConfig: presetDesign({
      primaryColor: "#14532d",
      headerStyle: "banner",
      ctaLabel: "Open your dashboard",
      ctaUrl: "https://frogmen.app/dashboard",
      footerText: "We're glad to be working with {{company}}.",
    }),
    bodyHtml: `
<p>Hello {{first_name}},</p>

<p>Welcome aboard. We're looking forward to working with {{company}} — here's everything you need to get going.</p>

<div class="feature-card">
  <div class="badge">Step 1</div>
  <h3 style="margin-top:0;">Open your client dashboard</h3>
  <p style="margin-bottom:0;">See quotes, inspection reports and project status in one place, any time.</p>
</div>

<div class="feature-card">
  <div class="badge">Step 2</div>
  <h3 style="margin-top:0;">Meet your technical lead</h3>
  <p style="margin-bottom:0;">They'll be your single point of contact for specifications, scheduling and urgent call-outs.</p>
</div>

<p>If anything is unclear, just reply to this email — it comes straight to our team.</p>
    `.trim(),
  },
  {
    id: "preset-b2b-outreach",
    name: "B2B Outreach & Follow-up",
    category: "outreach",
    description: "A short, personal note on a quiet letterhead — written to get a reply.",
    subject: "Quick question about {{company}}'s inspection schedule",
    previewText: "Ten minutes next week?",
    designConfig: presetDesign({
      primaryColor: "#111816",
      headerStyle: "minimal",
      ctaLabel: "Pick a time",
      ctaUrl: "https://calendly.com",
      ctaStyle: "outline",
      footerText: "Sent by the Frogmen commercial team.",
    }),
    bodyHtml: `
<p>Hi {{first_name}},</p>

<p>I noticed {{company}} runs subsea and marine operations, so I wanted to reach out briefly.</p>

<p>We help teams like yours inspect assets faster: high-precision ROV surveys with defect reports delivered within a day, which usually saves project managers 20+ hours per inspection cycle.</p>

<p>Would a 10-minute call next week be useful to see if there's a fit for your upcoming quarter?</p>

<p>Best regards,<br /><strong>The Commercial Team</strong><br />Frogmen Technologies</p>
    `.trim(),
  },
  {
    id: "preset-clean-letter",
    name: "Minimal Direct Letter",
    category: "custom",
    description: "A plain, elegant letter — for updates that should feel personal.",
    subject: "An update for {{company}}",
    previewText: "A short note from our operations team.",
    designConfig: presetDesign({
      primaryColor: "#1f3d35",
      headerStyle: "minimal",
      showLogo: false,
      ctaLabel: "View the details",
      ctaUrl: "https://frogmen.app",
      footerText: "Frogmen Technologies — direct correspondence.",
    }),
    bodyHtml: `
<p>Dear {{name}},</p>

<p>I'm writing with a short update on our work together with {{company}}.</p>

<p>You'll find the full details in your account. Please take a look when you have a moment, and let me know how we can best support your next milestones.</p>

<p>Warm regards,<br /><strong>Operations Director</strong><br />Frogmen Technologies</p>
    `.trim(),
  },
];
