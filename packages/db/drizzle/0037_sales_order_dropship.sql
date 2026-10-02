ALTER TABLE "sales_orders"
  ADD COLUMN IF NOT EXISTS "is_dropship" boolean NOT NULL DEFAULT false;

ALTER TABLE "sales_order_lines"
  ADD COLUMN IF NOT EXISTS "supply_reference" varchar(120);
