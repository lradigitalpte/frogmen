import { describe, expect, it } from "vitest";
import { isSignatureImage } from "./signature-image";

describe("isSignatureImage", () => {
  it("accepts embedded raster images", () => {
    expect(isSignatureImage("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isSignatureImage("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
  });

  it("rejects remote URLs, SVG and markup", () => {
    expect(isSignatureImage("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isSignatureImage("file:///etc/passwd")).toBe(false);
    expect(isSignatureImage("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isSignatureImage('data:image/png;base64,AAAA" onerror="x')).toBe(false);
  });
});
