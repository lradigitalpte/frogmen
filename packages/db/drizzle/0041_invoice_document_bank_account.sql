ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "document_bank_account_id" uuid REFERENCES "bank_accounts"("id") ON DELETE set null;
