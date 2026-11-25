import AdmZip from "adm-zip";
import { sql } from "drizzle-orm";
import type { Database } from "@frog1/db";
import { quoteIdent } from "./platform-org-delete";

/** Sign-in data, live invitation links and tables shared by every organization. */
const EXCLUDED_TABLES = new Set([
  "users",
  "sessions",
  "accounts",
  "verifications",
  "invitations",
  "currencies",
  "platform_backups",
]);

/** Credentials and public-link tokens never leave the database. */
const SECRET_COLUMN = /password|secret|token|_hash$/i;

export type ExportColumn = { table: string; column: string };
export type ExportForeignKey = {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
};

/**
 * How to find one organization's rows in each table: directly by
 * organization_id, or through a foreign key to a table already covered.
 * Conditions use $ORG as the organization placeholder.
 */
export function planOrganizationExport(
  columns: ExportColumn[],
  foreignKeys: ExportForeignKey[],
): Map<string, string> {
  const tables = new Set(
    columns.map((c) => c.table).filter((t) => !EXCLUDED_TABLES.has(t)),
  );
  const plan = new Map<string, string>();
  if (tables.has("organizations")) plan.set("organizations", `"id" = $ORG`);
  for (const { table, column } of columns) {
    if (column === "organization_id" && tables.has(table)) {
      plan.set(table, `"organization_id" = $ORG`);
    }
  }

  for (let added = true; added; ) {
    added = false;
    for (const table of tables) {
      if (plan.has(table)) continue;
      const conditions = foreignKeys
        .filter((fk) => fk.fromTable === table && fk.toTable !== table && plan.has(fk.toTable))
        .map(
          (fk) =>
            `${quoteIdent(fk.fromColumn)} in (select ${quoteIdent(fk.toColumn)} from ${quoteIdent(fk.toTable)} where ${plan.get(fk.toTable)})`,
        );
      if (conditions.length) {
        plan.set(table, `(${conditions.join(" or ")})`);
        added = true;
      }
    }
  }
  return plan;
}

/** CSV for spreadsheets; text that a spreadsheet would run as a formula is neutralized. */
export function toCsv(headings: string[], rows: Record<string, unknown>[]): string {
  const cell = (value: unknown) => {
    if (value === null || value === undefined) return "";
    let text = typeof value === "object" ? JSON.stringify(value) : String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) {
      text = `'${text}`;
    }
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headings, ...rows.map((row) => headings.map((h) => row[h]))]
    .map((line) => line.map(cell).join(","))
    .join("\r\n");
}

/** Every row belonging to one organization, as a ZIP, read from a single snapshot. */
export async function exportOrganization(
  db: Database,
  organization: { id: string; name: string; slug: string },
) {
  return db.transaction(
    async (tx) => {
      // Fail loudly rather than silently skip rows if row security would apply to this role.
      await tx.execute(sql.raw("set local row_security = off"));

      const columns = Array.from(
        await tx.execute(sql`
          select c.relname as "table", a.attname as "column"
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = c.oid
          where n.nspname = 'public' and c.relkind = 'r'
            and a.attnum > 0 and not a.attisdropped
          order by c.relname, a.attnum
        `),
      ) as unknown as ExportColumn[];
      const foreignKeys = Array.from(
        await tx.execute(sql`
          select src.relname as "fromTable", sa.attname as "fromColumn",
                 dst.relname as "toTable", da.attname as "toColumn"
          from pg_constraint con
          join pg_class src on src.oid = con.conrelid
          join pg_class dst on dst.oid = con.confrelid
          join pg_namespace n on n.oid = src.relnamespace
          join pg_attribute sa on sa.attrelid = src.oid and sa.attnum = con.conkey[1]
          join pg_attribute da on da.attrelid = dst.oid and da.attnum = con.confkey[1]
          where con.contype = 'f' and n.nspname = 'public'
            and array_length(con.conkey, 1) = 1
        `),
      ) as unknown as ExportForeignKey[];

      const plan = planOrganizationExport(columns, foreignKeys);
      const zip = new AdmZip();
      const tables: Record<string, number> = {};
      let rowCount = 0;

      const add = (table: string, headings: string[], lines: string[]) => {
        zip.addFile(`data/${table}.ndjson`, Buffer.from(lines.join("\n"), "utf8"));
        zip.addFile(
          `csv/${table}.csv`,
          Buffer.from("\ufeff" + toCsv(headings, lines.map((l) => JSON.parse(l))), "utf8"),
        );
        tables[table] = lines.length;
        rowCount += lines.length;
      };

      for (const table of [...plan.keys()].sort()) {
        const headings = columns
          .filter((c) => c.table === table && !SECRET_COLUMN.test(c.column))
          .map((c) => c.column);
        const where = sql.join(
          plan.get(table)!.split("$ORG").flatMap((part, i) =>
            i === 0 ? [sql.raw(part)] : [sql`${organization.id}`, sql.raw(part)],
          ),
          sql.raw(""),
        );
        const list = sql.raw(headings.map(quoteIdent).join(", "));
        const rows = Array.from(
          await tx.execute(
            sql`select row_to_json(t)::text as line from (select ${list} from ${sql.raw(quoteIdent(table))} where ${where}) t`,
          ),
        ) as unknown as Array<{ line: string }>;
        add(table, headings, rows.map((r) => r.line));
      }

      // Enough to know who the ids belong to; no passwords or sessions.
      const people = Array.from(
        await tx.execute(
          sql`select row_to_json(t)::text as line from (
            select u.id, u.name, u.email, m.role
            from members m join users u on u.id = m.user_id
            where m.organization_id = ${organization.id}
          ) t`,
        ),
      ) as unknown as Array<{ line: string }>;
      add("member_users", ["id", "name", "email", "role"], people.map((r) => r.line));

      zip.addFile(
        "manifest.json",
        Buffer.from(
          JSON.stringify({ format: 1, createdAt: new Date().toISOString(), organization, tables }, null, 2),
        ),
      );
      zip.addFile(
        "README.txt",
        Buffer.from(
          [
            `Backup of ${organization.name} (${organization.slug})`,
            "",
            "csv/   one spreadsheet per table, for reading",
            "data/  the same rows as JSON lines, exact values, for restoring",
            "",
            "Not included: uploaded files and videos (they stay in file storage and are",
            "referenced by path), passwords, sign-in sessions, pending invitations and",
            "public share-link tokens.",
            "",
            "This file contains confidential company data. Keep it somewhere private.",
          ].join("\r\n"),
        ),
      );
      return { buffer: zip.toBuffer(), tableCount: Object.keys(tables).length, rowCount };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
