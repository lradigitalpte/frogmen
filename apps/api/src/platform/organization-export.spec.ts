import { describe, expect, it } from "vitest";
import { planOrganizationExport, toCsv } from "./organization-export";

describe("planOrganizationExport", () => {
  const columns = [
    { table: "organizations", column: "id" },
    { table: "invoices", column: "organization_id" },
    { table: "invoice_lines", column: "invoice_id" },
    { table: "line_serials", column: "line_id" },
    { table: "sessions", column: "organization_id" },
    { table: "currencies", column: "id" },
  ];
  const fk = (fromTable: string, fromColumn: string, toTable: string) => ({
    fromTable,
    fromColumn,
    toTable,
    toColumn: "id",
  });

  it("follows child tables and leaves out sign-in and shared tables", () => {
    const plan = planOrganizationExport(columns, [
      fk("line_serials", "line_id", "invoice_lines"),
      fk("invoice_lines", "invoice_id", "invoices"),
    ]);
    expect([...plan.keys()].sort()).toEqual([
      "invoice_lines",
      "invoices",
      "line_serials",
      "organizations",
    ]);
    expect(plan.get("invoice_lines")).toBe(
      '("invoice_id" in (select "id" from "invoices" where "organization_id" = $ORG))',
    );
    expect(plan.get("line_serials")).toContain("$ORG");
  });
});

describe("toCsv", () => {
  it("escapes values and neutralizes formulas", () => {
    expect(toCsv(["a", "b", "c"], [{ a: 'x,"y"', b: "=1+1", c: -5 }])).toBe(
      'a,b,c\r\n"x,""y""",\'=1+1,-5',
    );
  });
});
