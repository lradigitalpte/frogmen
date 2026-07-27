import type { Metadata } from "next";
import { PublicReportPage } from "@/components/rov/public-report-page";

export const metadata: Metadata = {
  title: "Inspection Report",
};

export default async function ReportRoutePage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;
  return <PublicReportPage hash={hash} />;
}
