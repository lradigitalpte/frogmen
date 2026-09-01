import { CampaignFormPage } from "@/components/email-marketing/campaign-form-page";

interface EditCampaignPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCampaignPage({ params }: EditCampaignPageProps) {
  const { id } = await params;
  return <CampaignFormPage campaignId={id} />;
}
