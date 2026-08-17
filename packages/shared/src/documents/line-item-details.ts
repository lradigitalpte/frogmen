import { escapeHtml } from "../email/email-layout";

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function productDetailsLines(
  lineDescription: string | null | undefined,
  productDescription: string | null | undefined,
): string[] {
  const details = productDescription?.trim();
  if (!details) {
    return [];
  }

  const title = (lineDescription ?? "").trim();
  if (title) {
    const compactTitle = compactText(title);
    const compactDetails = compactText(details);
    if (
      compactTitle === compactDetails ||
      compactTitle.includes(compactDetails)
    ) {
      return [];
    }
  }

  return details
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•*]\s+/, "").trim())
    .filter(Boolean);
}

export function formatProductDetailsInline(
  lineDescription: string | null | undefined,
  productDescription: string | null | undefined,
): string | undefined {
  const items = productDetailsLines(lineDescription, productDescription);
  if (items.length === 0) {
    return undefined;
  }

  return items.join(", ");
}

export type LineItemDetailsLayout = "bullets" | "comma";

export function renderLineItemDescriptionHtml(
  description: string,
  productDescription?: string | null,
  layout: LineItemDetailsLayout = "bullets",
): string {
  const items = productDetailsLines(description, productDescription);
  const titleHtml = `<div class="line-title">${escapeHtml(description)}</div>`;
  if (items.length === 0) {
    return titleHtml;
  }

  if (layout === "comma") {
    return `${titleHtml}<div class="line-details">${escapeHtml(items.join(", "))}</div>`;
  }

  const list = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `${titleHtml}<ul class="line-details">${list}</ul>`;
}
