ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "price_currency_id" uuid;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_currency_id_currencies_id_fk" FOREIGN KEY ("price_currency_id") REFERENCES "public"."currencies"("id") ON DELETE no action ON UPDATE no action;
