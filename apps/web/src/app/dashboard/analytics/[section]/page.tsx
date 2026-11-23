import { notFound } from "next/navigation";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { isAnalyticsSection } from "@/lib/analytics-sections";

interface PageProps {
  params: Promise<{ section: string }>;
}

export default async function AnalyticsSectionPage({ params }: PageProps) {
  const { section } = await params;
  if (!isAnalyticsSection(section)) notFound();
  return <AnalyticsDashboard section={section} />;
}
