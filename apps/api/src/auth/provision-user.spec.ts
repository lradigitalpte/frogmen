import { describe, expect, it } from "vitest";
import { generateTemporaryPassword } from "./provision-user";

describe("generateTemporaryPassword", () => {
  it("creates a password with the requested length", () => {
    expect(generateTemporaryPassword()).toHaveLength(14);
    expect(generateTemporaryPassword(20)).toHaveLength(20);
  });
});
