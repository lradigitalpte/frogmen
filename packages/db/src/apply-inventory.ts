import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

async function tableExists(sql: postgres.Sql, tableName: string) {
  const [{ exists }] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS exists
  `;

  return exists;
}

async function applyMigrationFile(sql: postgres.Sql, fileName: string) {
  const migrationPath = resolve(__dirname, `../drizzle/${fileName}`);
  const migration = readFileSync(migrationPath, "utf8");
  const statements = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql.unsafe(statement);
  }
}

export async function applyInventoryIfNeeded(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });

  try {
    if (!(await tableExists(sql, "warehouses"))) {
      await applyMigrationFile(sql, "0002_warehouses.sql");
      console.log("[db] warehouses schema applied");
    }

    if (!(await tableExists(sql, "products"))) {
      await applyMigrationFile(sql, "0003_products.sql");
      console.log("[db] products schema applied");
    }

    if (!(await tableExists(sql, "stock_levels"))) {
      await applyMigrationFile(sql, "0004_stock_units.sql");
      console.log("[db] stock and product units schema applied");
    }

    const [{ hasImages }] = await sql<{ hasImages: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'products'
          AND column_name = 'images'
      ) AS "hasImages"
    `;

    if (!hasImages) {
      await applyMigrationFile(sql, "0005_product_fields.sql");
      console.log("[db] product images and inventory fields applied");
    }

    const [{ hasEquipmentRole }] = await sql<{ hasEquipmentRole: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'products'
          AND column_name = 'equipment_role'
      ) AS "hasEquipmentRole"
    `;

    if (!hasEquipmentRole) {
      await applyMigrationFile(sql, "0007_product_equipment_role.sql");
      console.log("[db] product equipment role applied");
    }

    const [{ hasUsageType }] = await sql<{ hasUsageType: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'products'
          AND column_name = 'usage_type'
      ) AS "hasUsageType"
    `;

    if (!hasUsageType) {
      await applyMigrationFile(sql, "0011_product_usage_rov.sql");
      console.log("[db] product usage type and ROV flag applied");
    }

    const [{ hasTags }] = await sql<{ hasTags: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'products'
          AND column_name = 'tags'
      ) AS "hasTags"
    `;

    if (!hasTags) {
      await applyMigrationFile(sql, "0012_product_tags.sql");
      console.log("[db] product tags applied");
    }

    if (!(await tableExists(sql, "product_tag_catalog"))) {
      await applyMigrationFile(sql, "0013_product_tag_catalog.sql");
      console.log("[db] product tag catalog applied");
    }

    if (!(await tableExists(sql, "product_category_catalog"))) {
      await applyMigrationFile(sql, "0014_product_categories.sql");
      console.log("[db] product category catalog applied");
    }

    if (!(await tableExists(sql, "warranty_policies"))) {
      await applyMigrationFile(sql, "0015_warranty.sql");
      console.log("[db] warranty schema applied");
    }
  } finally {
    await sql.end();
  }
}
