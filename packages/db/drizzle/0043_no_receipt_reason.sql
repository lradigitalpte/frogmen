ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "no_receipt_reason" varchar(500);
--> statement-breakpoint
ALTER TABLE "expense_claims" ADD COLUMN IF NOT EXISTS "no_receipt_reason" varchar(500);
