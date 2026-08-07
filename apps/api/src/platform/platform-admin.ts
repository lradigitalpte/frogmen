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
