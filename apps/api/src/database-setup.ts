import {
  applyAccountingIfNeeded,
  applyBankAccountsIfNeeded,
  applyCompanyVaultIfNeeded,
  applyCreditNotesIfNeeded,
  applyCustomerCreditIfNeeded,
  applyCustomerIsLocalIfNeeded,
  applyCustomersIfNeeded,
  applyDealsIfNeeded,
  applyEmailMarketingIfNeeded,
  applyExpensesIfNeeded,
  applyInventoryIfNeeded,
  applyLeadsIfNeeded,
  applyPaymentRemindersIfNeeded,
  applyPurchasingIfNeeded,
  applyQuotationSignatureFieldsIfNeeded,
  applyRovInspectionIfNeeded,
  applyUserAuthFlagsIfNeeded,
  ensureCurrencies,
  runMigrations,
} from "@frog1/db";

export async function runDatabaseSetup(databaseUrl: string) {
  await runMigrations(databaseUrl);
  await applyCustomersIfNeeded(databaseUrl);
  await applyCustomerCreditIfNeeded(databaseUrl);
  await applyCustomerIsLocalIfNeeded(databaseUrl);
  await applyInventoryIfNeeded(databaseUrl);
  await applyPaymentRemindersIfNeeded(databaseUrl);
  await applyAccountingIfNeeded(databaseUrl);
  await applyPurchasingIfNeeded(databaseUrl);
  await applyCreditNotesIfNeeded(databaseUrl);
  await applyRovInspectionIfNeeded(databaseUrl);
  await applyUserAuthFlagsIfNeeded(databaseUrl);
  await applyBankAccountsIfNeeded(databaseUrl);
  await applyExpensesIfNeeded(databaseUrl);
  await applyDealsIfNeeded(databaseUrl);
  await applyLeadsIfNeeded(databaseUrl);
  await applyEmailMarketingIfNeeded(databaseUrl);
  await applyCompanyVaultIfNeeded(databaseUrl);
  await applyQuotationSignatureFieldsIfNeeded(databaseUrl);
  await ensureCurrencies(databaseUrl);
}
