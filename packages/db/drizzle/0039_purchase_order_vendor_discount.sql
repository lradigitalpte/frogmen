ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "discount_percent" numeric(8, 4);
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(18, 2);
