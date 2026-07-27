import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { S3Service } from "./s3.service";

describe("S3Service object key isolation", () => {
  const service = new S3Service(new ConfigService());

  it("accepts keys within the active organization prefix", () => {
    expect(() =>
      service.assertValidKey(
        "rov-inspection/media/org-a/2026/07/file.mp4",
        "org-a",
      ),
    ).not.toThrow();
  });

  it("rejects another organization's key", () => {
    expect(() =>
      service.assertValidKey(
        "rov-inspection/media/org-b/2026/07/file.mp4",
        "org-a",
      ),
    ).toThrow(BadRequestException);
  });

  it("rejects traversal and backslash variants", () => {
    expect(() =>
      service.assertValidKey(
        "rov-inspection/media/org-a/../org-b/file.mp4",
        "org-a",
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      service.assertValidKey(
        "rov-inspection/media/org-a\\org-b\\file.mp4",
        "org-a",
      ),
    ).toThrow(BadRequestException);
  });
});
