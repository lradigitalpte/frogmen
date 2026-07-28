import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  renderBrandedEmail,
  textToHtmlParagraphs,
} from "./email-layout";

describe("email-layout", () => {
  it("escapes html characters", () => {
    expect(escapeHtml(`Tom & "Jerry" <test>`)).toBe(
      "Tom &amp; &quot;Jerry&quot; &lt;test&gt;",
    );
  });

  it("converts plain text paragraphs to html", () => {
    expect(textToHtmlParagraphs("Hello\nworld\n\nSecond block")).toContain(
      "Hello<br />world",
    );
    expect(textToHtmlParagraphs("Hello\nworld\n\nSecond block")).toContain(
      "Second block",
    );
  });

  it("renders branded email with cta", () => {
    const result = renderBrandedEmail({
      title: "Join Acme",
      bodyText: "You are invited.",
      ctaLabel: "Accept",
      ctaUrl: "https://app.frogmentec.ae/invite/abc",
      footerNote: "Expires in 7 days.",
    });

    expect(result.text).toContain("You are invited.");
    expect(result.text).toContain("https://app.frogmentec.ae/invite/abc");
    expect(result.html).toContain("FrogmenDash");
    expect(result.html).toContain("Accept");
    expect(result.html).toContain("Join Acme");
  });
});
