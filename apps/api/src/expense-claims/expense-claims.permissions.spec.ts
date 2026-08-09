import { describe, expect, it } from "vitest";
import { hasPermission } from "../security/permissions";

describe("expense claim permissions", () => {
  it("allows staff to submit claims but not review or reimburse", () => {
    expect(hasPermission("staff", "expense_claims.submit")).toBe(true);
    expect(hasPermission("staff", "expense_claims.review")).toBe(false);
    expect(hasPermission("staff", "expense_claims.reimburse")).toBe(false);
  });

  it("allows managers to submit and review but not reimburse", () => {
    expect(hasPermission("manager", "expense_claims.submit")).toBe(true);
    expect(hasPermission("manager", "expense_claims.review")).toBe(true);
    expect(hasPermission("manager", "expense_claims.reimburse")).toBe(false);
  });

  it("allows accountants full claim workflow", () => {
    expect(hasPermission("accountant", "expense_claims.submit")).toBe(true);
    expect(hasPermission("accountant", "expense_claims.review")).toBe(true);
    expect(hasPermission("accountant", "expense_claims.reimburse")).toBe(true);
  });
});
