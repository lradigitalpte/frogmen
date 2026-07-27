import { InvoiceViewPage } from "@/components/invoices/invoice-view-page";

interface PageProps {
  params: Promise<{ id: string }> | { id: string };
}

export default async function SingleInvoicePage({ params }: PageProps) {
  const resolvedParams = await Promise.resolve(params);
  return <InvoiceViewPage invoiceId={resolvedParams.id} />;
}
