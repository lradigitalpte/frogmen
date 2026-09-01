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

  // Feature cards regex
  const cardRegex = /<div class="feature-card"[^>]*>([\s\S]*?)<\/div>/gi;
  const cards: FeatureHighlightCard[] = [];
  let cardMatch: RegExpExecArray | null;

  while ((cardMatch = cardRegex.exec(html)) !== null) {
    const cardContent = cardMatch[1];
    const badgeMatch = /<div class="badge"[^>]*>([\s\S]*?)<\/div>/i.exec(cardContent);
    const titleMatch = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(cardContent);
    const descMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(cardContent);

    cards.push({
      badge: badgeMatch ? badgeMatch[1].replace(/<[^>]+>/g, "").trim() : "",
      title: titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "",
      description: descMatch
        ? descMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim()
        : "",
    });
  }

  // Remove feature cards to get leading and trailing text
  const cleanHtml = html.replace(cardRegex, "___FEATURE_CARDS_SPLIT___");
  const sections = cleanHtml.split("___FEATURE_CARDS_SPLIT___");
  const beforeText = sections[0] || "";
  const afterText = sections[1] || "";

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

/**
 * Wraps content in a dark-mode conscious, modern responsive email HTML shell.
 */
export function renderMarketingEmailHtml(options: RenderMarketingEmailOptions): {
  html: string;
  text: string;
} {
  const isDark = options.forceTheme === "dark";

  const design = {
    primaryColor: options.design?.primaryColor || "#047857",
    backgroundColor: options.design?.backgroundColor || "#f4f7f5",
    darkBackgroundColor: options.design?.darkBackgroundColor || "#090e17",
    cardBackgroundColor: options.design?.cardBackgroundColor || "#ffffff",
    darkCardBackgroundColor: options.design?.darkCardBackgroundColor || "#111827",
    textColor: options.design?.textColor || "#334155",
    darkTextColor: options.design?.darkTextColor || "#e2e8f0",
    headingColor: options.design?.headingColor || "#0f172a",
    darkHeadingColor: options.design?.darkHeadingColor || "#ffffff",
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

  // Theme-aware active inline palette
  const activeBg = isDark ? design.darkBackgroundColor : design.backgroundColor;
  const activeCardBg = isDark ? design.darkCardBackgroundColor : design.cardBackgroundColor;
  const activeText = isDark ? design.darkTextColor : design.textColor;
  const activeHeading = isDark ? design.darkHeadingColor : design.headingColor;
  const activeBorder = isDark ? "#1e293b" : "#e2e8f0";
  const activeFeatureCardBg = isDark ? "#172233" : "#f8fafc";
  const activeFeatureCardBorder = isDark ? "#24364e" : "#e2e8f0";
  const activeBadgeBg = isDark ? "#064e3b" : "#ecfdf5";
  const activeBadgeText = isDark ? "#34d399" : "#047857";
  const activeFooterBorder = isDark ? "#1e293b" : "rgba(226, 232, 240, 0.6)";
  const activeFooterText = isDark ? "#94a3b8" : "#64748b";
  const activeHeaderMinimalBorder = isDark ? "#1e293b" : "#e2e8f0";

  const mergeData = options.mergeData || {};
  const previewText = options.previewText ? interpolateVariables(options.previewText, mergeData) : "";
  const interpolatedSubject = interpolateVariables(options.subject, mergeData);

  // Interpolate body HTML or construct from bodyText
  let rawBodyHtml = options.bodyHtml?.trim() || "";
  if (!rawBodyHtml && options.bodyText) {
    rawBodyHtml = textToHtmlParagraphs(options.bodyText);
  }
  const bodyContent = interpolateVariables(rawBodyHtml, mergeData);

  // Button HTML
  let ctaHtml = "";
  if (design.ctaLabel && design.ctaUrl) {
    const interpolatedCtaUrl = interpolateVariables(design.ctaUrl, mergeData);
    const interpolatedCtaLabel = interpolateVariables(design.ctaLabel, mergeData);
    const borderRadius =
      design.ctaStyle === "rounded" ? "10px" : design.ctaStyle === "outline" ? "6px" : "4px";
    const borderStyle =
      design.ctaStyle === "outline"
        ? `border:2px solid ${design.primaryColor};background:transparent;color:${isDark ? "#34d399" : design.primaryColor};`
        : `background:${design.primaryColor};color:#ffffff;border:none;`;

    ctaHtml = `
      <div style="margin:28px 0 16px;text-align:left;" class="cta-wrapper">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${interpolatedCtaUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="18%" stroke="f" fillcolor="${design.primaryColor}">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">${escapeHtml(interpolatedCtaLabel)}</center>
        </v:roundrect>
        <![endif]-->
        <a href="${interpolatedCtaUrl}" class="email-button" style="display:inline-block;padding:14px 28px;border-radius:${borderRadius};${borderStyle}font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.01em;box-shadow:0 4px 12px ${isDark ? "rgba(16,185,129,0.2)" : "rgba(4,120,87,0.2)"};transition:all 0.2s;">
          ${escapeHtml(interpolatedCtaLabel)} &rarr;
        </a>
      </div>
    `;
  }

  // Header HTML based on style
  let headerHtml = "";
  if (design.headerStyle === "banner") {
    headerHtml = `
      <div class="email-header-banner" style="padding:28px 32px;background:linear-gradient(135deg, ${design.primaryColor}, #059669);color:#ffffff;border-top-left-radius:16px;border-top-right-radius:16px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td>
              ${
                design.showLogo && design.logoUrl
                  ? `<img src="${design.logoUrl}" alt="${escapeHtml(design.brandName)}" class="email-logo" style="display:block;max-width:140px;max-height:48px;margin-bottom:12px;border:0;" />`
                  : ""
              }
              <div style="font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.9);margin-bottom:6px;">${escapeHtml(design.brandName)}</div>
              <h1 class="email-subject-heading" style="margin:0;font-size:24px;line-height:1.3;font-weight:800;color:#ffffff;letter-spacing:-0.01em;">${escapeHtml(interpolatedSubject)}</h1>
            </td>
          </tr>
        </table>
      </div>
    `;
  } else if (design.headerStyle === "centered") {
    headerHtml = `
      <div class="email-header-centered" style="padding:32px 24px 16px;text-align:center;">
        ${
          design.showLogo && design.logoUrl
            ? `<img src="${design.logoUrl}" alt="${escapeHtml(design.brandName)}" class="email-logo" style="display:inline-block;max-width:150px;max-height:50px;margin-bottom:16px;border:0;" />`
            : `<div style="font-size:15px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:${isDark ? "#34d399" : design.primaryColor};margin-bottom:12px;">${escapeHtml(design.brandName)}</div>`
        }
        <h1 class="email-subject-heading" style="margin:0;font-size:26px;line-height:1.28;font-weight:800;color:${activeHeading};">${escapeHtml(interpolatedSubject)}</h1>
      </div>
    `;
  } else {
    // Minimal
    headerHtml = `
      <div class="email-header-minimal" style="padding:24px 32px 14px;border-bottom:1px solid ${activeHeaderMinimalBorder};">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td>
              <span style="font-size:15px;font-weight:800;letter-spacing:0.02em;color:${isDark ? "#34d399" : design.primaryColor};">${escapeHtml(design.brandName)}</span>
            </td>
            <td align="right">
              <span style="font-size:12px;font-weight:500;color:${activeFooterText};">${new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  // Footer HTML
  const unsubscribeUrl = mergeData.unsubscribeUrl || "#";
  const footerHtml = `
    <div class="email-footer" style="padding:24px 32px;font-size:12px;line-height:1.65;color:${activeFooterText};text-align:center;border-top:1px solid ${activeFooterBorder};">
      <p style="margin:0 0 8px;">${escapeHtml(design.footerText)}</p>
      <p style="margin:0 0 10px;font-weight:600;">${escapeHtml(design.companyAddress)}</p>
      ${
        design.showUnsubscribe
          ? `
        <p style="margin:0;">
          <a href="${unsubscribeUrl}" class="unsubscribe-link" style="color:${isDark ? "#60a5fa" : "#0284c7"};text-decoration:underline;">Unsubscribe</a> &bull; <a href="#" class="footer-pref-link" style="color:${activeFooterText};text-decoration:none;">Manage Preferences</a>
        </p>
      `
          : ""
      }
    </div>
  `;

  // Tracking pixel
  const trackingPixelHtml = mergeData.trackingPixelUrl
    ? `<img src="${mergeData.trackingPixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;max-height:1px;max-width:1px;opacity:0;border:0;" />`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      height: 100% !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: ${activeBg};
      color: ${activeText};
    }
    a { color: ${isDark ? "#34d399" : design.primaryColor}; text-decoration: none; }
    p { margin: 0 0 16px; font-size: 15px; line-height: 1.65; color: ${activeText}; }
    h1, h2, h3, h4 { color: ${activeHeading}; font-weight: 700; margin: 0 0 14px; }
    h2 { font-size: 20px; line-height: 1.35; }
    h3 { font-size: 17px; line-height: 1.4; }
    ul, ol { margin: 0 0 16px; padding-left: 24px; font-size: 15px; line-height: 1.65; color: ${activeText}; }
    li { margin-bottom: 6px; }
    .feature-card {
      background: ${activeFeatureCardBg};
      border: 1px solid ${activeFeatureCardBorder};
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      border-radius: 9999px;
      background: ${activeBadgeBg};
      color: ${activeBadgeText};
      margin-bottom: 12px;
    }
    /* Dark Mode Media Query for Inboxes */
    @media (prefers-color-scheme: dark) {
      body, .email-bg {
        background-color: ${design.darkBackgroundColor} !important;
        color: ${design.darkTextColor} !important;
      }
      .email-card {
        background-color: ${design.darkCardBackgroundColor} !important;
        border-color: #1e293b !important;
        box-shadow: 0 8px 30px rgba(0,0,0,0.6) !important;
      }
      .email-body, .email-body-inner, p, ul, ol, li {
        color: ${design.darkTextColor} !important;
      }
      h1, h2, h3, h4, .email-subject-heading {
        color: ${design.darkHeadingColor} !important;
      }
      .feature-card {
        background: #172233 !important;
        border-color: #24364e !important;
      }
      .badge {
        background: #064e3b !important;
        color: #34d399 !important;
      }
      .email-header-minimal {
        border-bottom-color: #1e293b !important;
      }
      .email-footer {
        border-top-color: #1e293b !important;
        color: #94a3b8 !important;
      }
      .unsubscribe-link, .footer-pref-link {
        color: #94a3b8 !important;
      }
    }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; padding: 12px !important; }
      .email-card { border-radius: 12px !important; }
      .email-header-banner, .email-body, .email-footer { padding: 20px 18px !important; }
      .email-subject-heading { font-size: 20px !important; }
      .email-button { display: block !important; text-align: center !important; width: auto !important; }
    }
  </style>
</head>
<body class="email-bg" style="margin:0;padding:0;background-color:${activeBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  ${
    previewText
      ? `
  <div style="display:none;font-size:1px;color:#fefefe;line-height:1px;font-family:Arial,sans-serif;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(previewText)}
    &#847; &zwnj; &nbsp; &#8199; &shy; &#847; &zwnj; &nbsp; &#8199; &shy;
  </div>
  `
      : ""
  }

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-bg" style="background-color:${activeBg};">
    <tr>
      <td align="center" style="padding:28px 12px;" class="email-container">
        <!--[if (gte mso 9)|(IE)]>
        <table align="center" border="0" cellspacing="0" cellpadding="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background-color:${activeCardBg};border:1px solid ${activeBorder};border-radius:16px;overflow:hidden;box-shadow:0 6px 24px ${isDark ? "rgba(0,0,0,0.5)" : "rgba(15,23,42,0.08)"};" class="email-card">
          <!-- Header -->
          <tr>
            <td>
              ${headerHtml}
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding:32px 32px 20px;" class="email-body">
              <div style="font-size:15px;line-height:1.65;color:${activeText};" class="email-body-inner">
                ${bodyContent}
              </div>
              ${ctaHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td>
              ${footerHtml}
            </td>
          </tr>
        </table>
        <!--[if (gte mso 9)|(IE)]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
  ${trackingPixelHtml}
</body>
</html>`.trim();

  const text = `${interpolatedSubject}\n\n${options.bodyText || rawBodyHtml.replace(/<[^>]+>/g, " ")}\n\n${
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

export const SYSTEM_PRESET_TEMPLATES: SystemPresetTemplate[] = [
  {
    id: "preset-product-announcement",
    name: "Product & Feature Launch",
    category: "announcement",
    description: "Sleek hero announcement with highlight cards, feature breakdown, and primary call to action.",
    subject: "Introducing our newest capabilities for {{company}}",
    previewText: "Discover what's new and see how it streamlines your operations.",
    designConfig: {
      primaryColor: "#047857",
      backgroundColor: "#f4f7f5",
      darkBackgroundColor: "#090e17",
      cardBackgroundColor: "#ffffff",
      darkCardBackgroundColor: "#111827",
      textColor: "#334155",
      darkTextColor: "#e2e8f0",
      headingColor: "#0f172a",
      darkHeadingColor: "#ffffff",
      showLogo: true,
      brandName: "Frogmen Technologies",
      headerStyle: "banner",
      ctaLabel: "Explore New Features",
      ctaUrl: "https://frogmen.app/dashboard",
      ctaStyle: "rounded",
      footerText: "You are receiving this update as a valued partner of Frogmen Technologies.",
      companyAddress: "Frogmen Technologies Pte Ltd",
      showUnsubscribe: true,
    },
    bodyHtml: `
<p>Hello {{first_name}},</p>

<p>We are thrilled to announce a major update designed to enhance your workflow and drive greater efficiency across {{company}}.</p>

<div class="feature-card">
  <div class="badge">NEW CAPABILITY</div>
  <h3 style="margin-top:0;">Real-Time Operational Intelligence</h3>
  <p style="margin-bottom:0;">Automate data synchronization, streamline quotation approvals, and track end-to-end deliverables with instant visibility.</p>
</div>

<div class="feature-card">
  <div class="badge">INTEGRATION</div>
  <h3 style="margin-top:0;">Unified Communication Hub</h3>
  <p style="margin-bottom:0;">Keep every team member and stakeholder aligned with integrated activity logs and automated delivery notifications.</p>
</div>

<p>We've already enabled these improvements on your account. Click below to experience the latest version or reply directly to this email with any questions.</p>
    `.trim(),
  },
  {
    id: "preset-promotional-offer",
    name: "Exclusive Partner Offer",
    category: "promotion",
    description: "High-impact promotional campaign with highlight badge, value proposition, and time-sensitive CTA.",
    subject: "Exclusive offer for {{company}} — limited time pricing",
    previewText: "Unlock specialized service rates this month.",
    designConfig: {
      primaryColor: "#0f766e",
      backgroundColor: "#f0fdfa",
      darkBackgroundColor: "#041e1c",
      cardBackgroundColor: "#ffffff",
      darkCardBackgroundColor: "#0d2b27",
      textColor: "#334155",
      darkTextColor: "#e2e8f0",
      headingColor: "#0f172a",
      darkHeadingColor: "#ffffff",
      showLogo: true,
      brandName: "Frogmen Technologies",
      headerStyle: "banner",
      ctaLabel: "Claim Your Special Rate",
      ctaUrl: "https://frogmen.app/dashboard/sales/quotations",
      ctaStyle: "rounded",
      footerText: "Offer valid for registered accounts. Terms and conditions apply.",
      companyAddress: "Frogmen Technologies Pte Ltd",
      showUnsubscribe: true,
    },
    bodyHtml: `
<p>Hi {{first_name}},</p>

<p>As part of our commitment to supporting {{company}}'s upcoming projects, we are extending special commercial pricing for services confirmed this quarter.</p>

<div class="feature-card">
  <div class="badge">SPECIAL INCENTIVE</div>
  <h3 style="margin-top:0;">15% Preferential Credit</h3>
  <p style="margin-bottom:0;">On all ROV inspection packages and service contracts requested before the end of the month.</p>
</div>

<p>Whether you have scheduled maintenance or new deployments coming up, our engineering team is ready to assist with dedicated priority scheduling.</p>
    `.trim(),
  },
  {
    id: "preset-newsletter-digest",
    name: "Industry Insights & Digest",
    category: "newsletter",
    description: "Clean editorial layout for monthly updates, industry analysis, and curated case studies.",
    subject: "Frogmen Monthly Dispatch: Insights & Updates for {{company}}",
    previewText: "Latest subsea inspection innovations and operational benchmarks.",
    designConfig: {
      primaryColor: "#0284c7",
      backgroundColor: "#f8fafc",
      darkBackgroundColor: "#090e17",
      cardBackgroundColor: "#ffffff",
      darkCardBackgroundColor: "#111827",
      textColor: "#334155",
      darkTextColor: "#e2e8f0",
      headingColor: "#0f172a",
      darkHeadingColor: "#ffffff",
      showLogo: true,
      brandName: "Frogmen Technologies",
      headerStyle: "centered",
      ctaLabel: "Read the Full Report",
      ctaUrl: "https://frogmen.app",
      ctaStyle: "rounded",
      footerText: "You are receiving our monthly technical newsletter.",
      companyAddress: "Frogmen Technologies Pte Ltd",
      showUnsubscribe: true,
    },
    bodyHtml: `
<p>Dear {{name}},</p>

<p>Welcome to this month's edition of the Frogmen Technical Digest. Here is a summary of the key developments and engineering highlights from our team.</p>

<div class="feature-card">
  <div class="badge">TECH SPOTLIGHT</div>
  <h3 style="margin-top:0;">1. Advanced ROV Telemetry</h3>
  <p style="margin-bottom:0;">Our latest offshore deployments demonstrated a 40% reduction in inspection turnaround times through AI-assisted defect tagging.</p>
</div>

<div class="feature-card">
  <div class="badge">COMPLIANCE</div>
  <h3 style="margin-top:0;">2. Regulatory Standards Update</h3>
  <p style="margin-bottom:0;">New compliance guidelines for marine asset integrity inspections take effect next quarter.</p>
</div>

<p>Thank you for partnering with us as we continue innovating subsea technology and asset safety.</p>
    `.trim(),
  },
  {
    id: "preset-welcome-onboarding",
    name: "Customer Onboarding & Welcome",
    category: "onboarding",
    description: "Warm introductory welcome with clear next steps and direct contact channels.",
    subject: "Welcome to Frogmen Technologies, {{first_name}}!",
    previewText: "Everything you need to get started with your account.",
    designConfig: {
      primaryColor: "#047857",
      backgroundColor: "#f4f7f5",
      darkBackgroundColor: "#090e17",
      cardBackgroundColor: "#ffffff",
      darkCardBackgroundColor: "#111827",
      textColor: "#334155",
      darkTextColor: "#e2e8f0",
      headingColor: "#0f172a",
      darkHeadingColor: "#ffffff",
      showLogo: true,
      brandName: "Frogmen Technologies",
      headerStyle: "banner",
      ctaLabel: "Access Your Dashboard",
      ctaUrl: "https://frogmen.app/dashboard",
      ctaStyle: "rounded",
      footerText: "We are glad to have {{company}} as our partner.",
      companyAddress: "Frogmen Technologies Pte Ltd",
      showUnsubscribe: true,
    },
    bodyHtml: `
<p>Hello {{first_name}},</p>

<p>Welcome to Frogmen Technologies! We are thrilled to partner with {{company}} and look forward to collaborating on your upcoming operations.</p>

<div class="feature-card">
  <div class="badge">STEP 1</div>
  <h3 style="margin-top:0;">Access Your Client Portal</h3>
  <p style="margin-bottom:0;">View active quotes, asset inspection reports, and project status in real-time.</p>
</div>

<div class="feature-card">
  <div class="badge">STEP 2</div>
  <h3 style="margin-top:0;">Connect with Your Technical Lead</h3>
  <p style="margin-bottom:0;">Reach out whenever you need custom specifications or rapid deployment assistance.</p>
</div>

<p>If you have any questions or require custom specifications, please do not hesitate to reach out directly.</p>
    `.trim(),
  },
  {
    id: "preset-b2b-outreach",
    name: "B2B Outreach & Follow-up",
    category: "outreach",
    description: "Direct, high-converting letterhead design for lead nurture and consultative follow-ups.",
    subject: "Quick question regarding {{company}}'s inspection projects",
    previewText: "Exploring subsea and marine asset maintenance efficiencies.",
    designConfig: {
      primaryColor: "#0f172a",
      backgroundColor: "#f8fafc",
      darkBackgroundColor: "#090d16",
      cardBackgroundColor: "#ffffff",
      darkCardBackgroundColor: "#111827",
      textColor: "#334155",
      darkTextColor: "#e2e8f0",
      headingColor: "#0f172a",
      darkHeadingColor: "#ffffff",
      showLogo: true,
      brandName: "Frogmen Technologies",
      headerStyle: "minimal",
      ctaLabel: "Schedule a 10-min Call",
      ctaUrl: "https://calendly.com",
      ctaStyle: "outline",
      footerText: "Sent by the Frogmen Commercial Team.",
      companyAddress: "Frogmen Technologies Pte Ltd",
      showUnsubscribe: true,
    },
    bodyHtml: `
<p>Hi {{first_name}},</p>

<p>I noticed {{company}} has active operations in marine engineering and subsea infrastructure, and wanted to reach out briefly.</p>

<div class="feature-card">
  <div class="badge">CAPABILITY</div>
  <h3 style="margin-top:0;">Subsea ROV Inspection & Integrity Audits</h3>
  <p style="margin-bottom:0;">High-precision asset scanning with AI-assisted defect reporting that saves project managers 20+ hours per inspection cycle.</p>
</div>

<p>Do you have 10 minutes next week to explore if there is a mutual fit for your upcoming quarter?</p>

<p>Best regards,<br /><strong>Commercial Team</strong><br />Frogmen Technologies</p>
    `.trim(),
  },
  {
    id: "preset-clean-letter",
    name: "Minimal Direct Letter",
    category: "custom",
    description: "Distraction-free personal letter style with clean formatting and elegant footer.",
    subject: "Update from Frogmen Technologies for {{company}}",
    previewText: "An important message from our executive team.",
    designConfig: {
      primaryColor: "#047857",
      backgroundColor: "#f8fafc",
      darkBackgroundColor: "#090e17",
      cardBackgroundColor: "#ffffff",
      darkCardBackgroundColor: "#111827",
      textColor: "#1e293b",
      darkTextColor: "#f1f5f9",
      headingColor: "#0f172a",
      darkHeadingColor: "#ffffff",
      showLogo: false,
      brandName: "Frogmen Technologies",
      headerStyle: "minimal",
      ctaLabel: "View Details",
      ctaUrl: "https://frogmen.app",
      ctaStyle: "rounded",
      footerText: "Frogmen Technologies — Confidential & Direct.",
      companyAddress: "Frogmen Technologies Pte Ltd",
      showUnsubscribe: true,
    },
    bodyHtml: `
<p>Dear {{name}},</p>

<p>I am writing to share an important update regarding our collaboration with {{company}}.</p>

<p>Please review the details attached or through your account portal, and let us know how we can best support your operational milestones.</p>

<p>Warm regards,<br /><strong>Operations Director</strong><br />Frogmen Technologies</p>
    `.trim(),
  },
];
