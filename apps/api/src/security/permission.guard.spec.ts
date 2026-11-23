import { describe, expect, it } from "vitest";
import { inferPermission, satisfies } from "./permission.guard";

const can = (role: Parameters<typeof satisfies>[0], method: string, path: string) => {
  const rule = inferPermission(method, path);
  return rule !== "deny" && satisfies(role, rule);
};

const ID = "6f1c2a7e-1111-4a5b-9c3d-123456789abc";

describe("PermissionGuard route rules", () => {
  it("matches whole segments, so /members and /media are not mistaken for /me", () => {
    expect(inferPermission("GET", "/api/v1/members")).toBe("members.manage");
    expect(inferPermission("DELETE", `/api/v1/rov/media/${ID}`)).toBe("rov.manage");
    expect(inferPermission("GET", "/api/v1/me")).toBeNull();
  });

  it("protects resources that previously had no rule", () => {
    expect(can("viewer", "POST", "/api/v1/delivery-notes")).toBe(false);
    expect(can("viewer", "POST", "/api/v1/leads")).toBe(false);
    expect(can("viewer", "DELETE", `/api/v1/rov/media/${ID}`)).toBe(false);
    expect(can("staff", "POST", "/api/v1/alerts/automation-rules/create")).toBe(false);
    expect(can("staff", "POST", `/api/v1/email-marketing/campaigns/${ID}/send`)).toBe(false);
    expect(can("manager", "POST", `/api/v1/email-marketing/campaigns/${ID}/send`)).toBe(true);
    expect(can("viewer", "PATCH", `/api/v1/units/${ID}`)).toBe(false);
  });

  it("lets operational roles read what their screens need", () => {
    // Invoice screens list bank accounts; claim forms list expense categories.
    expect(can("staff", "GET", "/api/v1/bank-accounts")).toBe(true);
    expect(can("staff", "GET", "/api/v1/expense-categories")).toBe(true);
    expect(can("staff", "POST", "/api/v1/bank-accounts")).toBe(false);
    expect(can("viewer", "GET", "/api/v1/calendar/items")).toBe(true);
    expect(can("viewer", "POST", "/api/v1/calendar/events")).toBe(false);
    expect(can("staff", "POST", "/api/v1/calendar/events")).toBe(true);
  });

  it("uses the action segment for approvals, posting and payments", () => {
    expect(inferPermission("POST", `/api/v1/quotations/${ID}/confirm`)).toBe("sales.approve");
    expect(inferPermission("POST", `/api/v1/quotations/${ID}/send-email`)).toBe("sales.write");
    expect(inferPermission("POST", `/api/v1/invoices/${ID}/pay`)).toBe("payments.record");
    expect(inferPermission("POST", `/api/v1/invoices/${ID}/confirm`)).toBe("invoices.post");
    expect(inferPermission("POST", `/api/v1/invoices/${ID}/cancellation-email`)).toBe("invoices.write");
    expect(inferPermission("POST", `/api/v1/goods-receipts/${ID}/validate`)).toBe("purchasing.receive");
    expect(inferPermission("POST", `/api/v1/purchase-orders/${ID}/receipts`)).toBe("purchasing.write");
  });

  it("refuses writes to resources without a rule", () => {
    expect(inferPermission("POST", "/api/v1/something-new")).toBe("deny");
    expect(inferPermission("GET", "/api/v1/something-new")).toBe("organization.read");
  });
});
