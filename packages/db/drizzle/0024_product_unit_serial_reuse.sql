-- Allow reusing serial numbers after units are scrapped.
-- Sold / in_stock / assigned serials stay unique per organization.
DROP INDEX IF EXISTS "product_units_org_serial_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "product_units_org_serial_active_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "product_units_org_serial_active_idx"
  ON "product_units" ("organization_id", "serial_number")
  WHERE "status" IN ('in_stock', 'assigned', 'sold');
