ALTER TABLE "exchange_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exchange_rates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exchange_rate_organization_isolation" ON "exchange_rates";
CREATE POLICY "exchange_rate_organization_isolation" ON "exchange_rates"
  USING (
    "organization_id" IS NULL
    OR "organization_id" = app_current_organization_id()
  )
  WITH CHECK ("organization_id" = app_current_organization_id());
