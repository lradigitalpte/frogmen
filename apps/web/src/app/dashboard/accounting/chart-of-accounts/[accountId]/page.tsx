import { AccountLedgerPage } from "@/components/accounting/account-ledger-page";

interface PageProps {
  params: Promise<{ accountId: string }>;
}

export default async function ChartOfAccountLedgerRoute({ params }: PageProps) {
  const { accountId } = await params;
  return <AccountLedgerPage accountId={accountId} />;
}
