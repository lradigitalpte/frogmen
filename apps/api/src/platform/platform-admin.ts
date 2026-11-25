import type { ConfigService } from "@nestjs/config";

export function parsePlatformAdminEmails(
  value: string | undefined | null,
): Set<string> {
  if (!value?.trim()) {
    return new Set();
  }

  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformAdminEmail(
  email: string | undefined | null,
  config: ConfigService,
): boolean {
  if (!email?.trim()) {
    return false;
  }

  const allowlist = parsePlatformAdminEmails(
    config.get<string>("PLATFORM_ADMIN_EMAILS"),
  );
  return allowlist.has(email.trim().toLowerCase());
}

/**
 * Platform admin rights follow the email address and emails aren't verified at
 * sign-up, so nobody may create a new account with one of these addresses.
 * Register the account first, then add its email to PLATFORM_ADMIN_EMAILS.
 */
export function isReservedPlatformAdminEmail(email: string): boolean {
  return parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS).has(
    email.trim().toLowerCase(),
  );
}
