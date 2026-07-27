import { QuotationBuilderPage } from "@/components/sales/quotation-builder-page";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditQuotationPage({ params }: PageProps) {
  const { id } = await params;
  return <QuotationBuilderPage quotationId={id} />;
}
