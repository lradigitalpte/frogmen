/**
 * Public web app origin for customer-facing links (quotation signing, invites, etc.).
 * On Railway the API must have WEB_URL set to the Vercel app domain.
 */
export function resolvePublicAppUrl(): string {
  const candidate =
    process.env.WEB_URL ??
    process.env.PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  return candidate.replace(/\/$/, "");
}

export function publicQuotationSigningPath(accessToken: string): string {
  return `/quotations/public/${accessToken}`;
}

export function publicQuotationSigningUrl(accessToken: string): string {
  return `${resolvePublicAppUrl()}${publicQuotationSigningPath(accessToken)}`;
}
