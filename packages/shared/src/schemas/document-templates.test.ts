import { describe, expect, it } from "vitest";
import {
  applyTemplatePlaceholders,
  DEFAULT_DOCUMENT_TEMPLATES,
  resolveDocumentTemplates,
} from "./document-templates";

describe("document-templates", () => {
  it("replaces placeholders", () => {
    expect(
      applyTemplatePlaceholders("Invoice {{number}} for {{customerName}}", {
        number: "INV-1",
        customerName: "DEWA",
      }),
    ).toBe("Invoice INV-1 for DEWA");
  });

  it("merges new email template defaults", () => {
    const resolved = resolveDocumentTemplates({});
    expect(resolved.invoiceEmailSubject).toBe(
      DEFAULT_DOCUMENT_TEMPLATES.invoiceEmailSubject,
    );
    expect(resolved.poEmailBodyIntro).toContain("{{number}}");
    expect(resolved.reminderEmailBodyIntro).toContain("{{outstanding}}");
  });
});
