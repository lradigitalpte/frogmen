import { describe, expect, it } from "vitest";

function buildInviteUrl(webUrl: string, invitationId: string, email: string) {
  const base = webUrl.replace(/\/$/, "");
  return `${base}/invite/${encodeURIComponent(invitationId)}?email=${encodeURIComponent(email)}`;
}

describe("invite url builder", () => {
  it("uses production web url instead of localhost", () => {
    const url = buildInviteUrl(
      "https://app.frogmentec.ae",
      "inv-123",
      "user@example.com",
    );

    expect(url).toBe(
      "https://app.frogmentec.ae/invite/inv-123?email=user%40example.com",
    );
    expect(url).not.toContain("localhost");
  });
});
