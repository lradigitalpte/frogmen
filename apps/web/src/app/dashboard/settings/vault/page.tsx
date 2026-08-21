"use client";

import { AppPage } from "@/components/layout/page";
import { CompanyFileVault } from "@/components/settings/company-file-vault";

export default function CompanyVaultPage() {
  return (
    <AppPage
      title="Company Cloud File Vault"
      subtitle="Enterprise storage for company contracts, ROV inspection videos, financial audits, and corporate media. File upload limit: 500 MB per file."
    >
      <CompanyFileVault />
    </AppPage>
  );
}
