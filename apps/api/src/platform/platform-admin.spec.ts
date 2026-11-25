import { afterEach, describe, expect, it, vi } from "vitest";
import { isReservedPlatformAdminEmail } from "./platform-admin";

describe("isReservedPlatformAdminEmail", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reserves listed addresses regardless of case and spacing", () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "root@example.com, Ops@Example.com");
    expect(isReservedPlatformAdminEmail(" OPS@example.com ")).toBe(true);
    expect(isReservedPlatformAdminEmail("someone@example.com")).toBe(false);
  });

  it("reserves nothing when unset", () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "");
    expect(isReservedPlatformAdminEmail("root@example.com")).toBe(false);
  });
});
