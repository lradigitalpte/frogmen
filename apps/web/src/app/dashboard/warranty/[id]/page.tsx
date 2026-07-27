import { WarrantyDetailPage } from "@/components/warranty/warranty-detail-page";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WarrantyDetailPage warrantyId={id} />;
}
