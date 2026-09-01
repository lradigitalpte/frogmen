import { describe, expect, it } from "vitest";
import {
  interpolateVariables,
  renderMarketingEmailHtml,
  SYSTEM_PRESET_TEMPLATES,
} from "./marketing-templates";

describe("interpolateVariables", () => {
  it("interpolates recipient merge tags correctly", () => {
    const template =
      "Hello {{first_name}}, is {{company}} interested in {{service}}? Contact {{email}} or unsub at {{unsubscribe_url}}";
    const data = {
      firstName: "Sarah",
      company: "OceanTech Offshore",
      service: "ROV Surveying",
      email: "sarah@oceantech.com",
      unsubscribeUrl: "https://frogmen.app/marketing/unsubscribe?token=abc123",
    };

    const result = interpolateVariables(template, data);
    expect(result).toBe(
      "Hello Sarah, is OceanTech Offshore interested in ROV Surveying? Contact sarah@oceantech.com or unsub at https://frogmen.app/marketing/unsubscribe?token=abc123",
    );
  });

  it("escapes special HTML characters in variable values", () => {
    const template = "Welcome, {{name}} from {{company}}!";
    const data = {
      name: "John & Jane <VIP>",
      company: 'A "Top" Brand',
    };

    const result = interpolateVariables(template, data);
    expect(result).toContain("John &amp; Jane &lt;VIP&gt;");
    expect(result).toContain("A &quot;Top&quot; Brand");
  });
});

describe("renderMarketingEmailHtml", () => {
  it("renders light and dark mode conscious HTML with styling", () => {
    const rendered = renderMarketingEmailHtml({
      subject: "Important Update for {{company}}",
      previewText: "Preview snippet text",
      bodyHtml: "<p>Hello {{first_name}},</p><p>We have an announcement.</p>",
      design: {
        primaryColor: "#047857",
        brandName: "Frogmen Technologies",
        headerStyle: "banner",
        ctaLabel: "View Portal",
        ctaUrl: "https://frogmen.app",
      },
      mergeData: {
        firstName: "Alex",
        company: "Marine Pro",
      },
    });

    expect(rendered.html).toContain("Important Update for Marine Pro");
    expect(rendered.html).toContain("Frogmen Technologies");
    expect(rendered.html).toContain("View Portal");
    expect(rendered.html).toContain("https://frogmen.app");
    expect(rendered.html).toContain("prefers-color-scheme: dark");
    expect(rendered.html).toContain("color-scheme: light dark");
    expect(rendered.text).toContain("Important Update for Marine Pro");
  });

  it("has valid system preset templates", () => {
    expect(SYSTEM_PRESET_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    for (const preset of SYSTEM_PRESET_TEMPLATES) {
      expect(preset.name).toBeTruthy();
      expect(preset.subject).toBeTruthy();
      expect(preset.bodyHtml).toBeTruthy();
      expect(preset.category).toBeTruthy();
    }
  });
});
