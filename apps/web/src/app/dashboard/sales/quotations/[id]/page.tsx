import { QuotationViewPage } from "@/components/sales/quotation-view-page";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function QuotationDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <QuotationViewPage quotationId={id} />;
}
