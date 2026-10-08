ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(18, 2) NOT NULL DEFAULT '0';
