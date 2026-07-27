import { describe, expect, it } from "vitest";
import {
  hasPermission,
  permissionsForRole,
  ROLE_PERMISSIONS,
  ROLES,
} from "./permissions";

describe("fixed RBAC permission matrix", () => {
  it("defines permissions for every fixed role", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...ROLES].sort());
  });

  it("grants owner and admin the complete permission set", () => {
    expect(permissionsForRole("owner")).toEqual(
      permissionsForRole("admin"),
    );
    expect(hasPermission("owner", "members.manage")).toBe(true);
    expect(hasPermission("admin", "branches.manage")).toBe(true);
  });

  it("keeps sensitive administration away from operational roles", () => {
    for (const role of ["manager", "accountant", "staff", "viewer"] as const) {
      expect(hasPermission(role, "members.manage")).toBe(false);
      expect(hasPermission(role, "branches.manage")).toBe(false);
      expect(hasPermission(role, "settings.manage")).toBe(false);
    }
  });

  it("prevents staff from approvals, posting, payments, and stock adjustment", () => {
    expect(hasPermission("staff", "sales.approve")).toBe(false);
    expect(hasPermission("staff", "invoices.post")).toBe(false);
    expect(hasPermission("staff", "payments.record")).toBe(false);
    expect(hasPermission("staff", "inventory.adjust")).toBe(false);
  });

  it("keeps viewers read-only", () => {
    const viewer = permissionsForRole("viewer");
    expect(viewer.every((permission) => permission.endsWith(".read"))).toBe(
      true,
    );
  });

  it("allows accountants to post and record payments without operations admin", () => {
    expect(hasPermission("accountant", "invoices.post")).toBe(true);
    expect(hasPermission("accountant", "payments.record")).toBe(true);
    expect(hasPermission("accountant", "inventory.adjust")).toBe(false);
    expect(hasPermission("accountant", "purchasing.approve")).toBe(false);
  });
});
