import { describe, expect, it } from "vitest";
import { quoteIdent, sortTablesForDeletion } from "./platform-org-delete";

describe("quoteIdent", () => {
  it("quotes a safe table name", () => {
    expect(quoteIdent("audit_logs")).toBe('"audit_logs"');
  });

  it("rejects unsafe identifiers", () => {
    expect(() => quoteIdent("audit_logs; drop table users")).toThrow(
      /Invalid SQL identifier/,
    );
  });
});

describe("sortTablesForDeletion", () => {
  it("deletes referencing tables before the tables they point at", () => {
    expect(
      sortTablesForDeletion(
        ["account_moves", "expenses", "gl_accounts", "bank_accounts"],
        [
          { fromTable: "expenses", toTable: "account_moves" },
          { fromTable: "bank_accounts", toTable: "gl_accounts" },
        ],
      ),
    ).toEqual(["bank_accounts", "expenses", "account_moves", "gl_accounts"]);
  });

  it("deletes sales documents before branches", () => {
    const ordered = sortTablesForDeletion(
      ["branches", "sales_orders", "invoices"],
      [
        { fromTable: "sales_orders", toTable: "branches" },
        { fromTable: "invoices", toTable: "branches" },
        { fromTable: "invoices", toTable: "sales_orders" },
      ],
    );

    expect(ordered.indexOf("invoices")).toBeLessThan(ordered.indexOf("sales_orders"));
    expect(ordered.indexOf("sales_orders")).toBeLessThan(ordered.indexOf("branches"));
  });

  it("ignores self-references so a single table delete still works", () => {
    expect(
      sortTablesForDeletion(
        ["product_category_catalog"],
        [{ fromTable: "product_category_catalog", toTable: "product_category_catalog" }],
      ),
    ).toEqual(["product_category_catalog"]);
  });

  it("falls back to a stable order when tables form a cycle", () => {
    expect(
      sortTablesForDeletion(
        ["a", "b"],
        [
          { fromTable: "a", toTable: "b" },
          { fromTable: "b", toTable: "a" },
        ],
      ),
    ).toEqual(["a", "b"]);
  });
});
