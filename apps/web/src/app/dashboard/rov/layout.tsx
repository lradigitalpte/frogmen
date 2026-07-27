import { RovLayout } from "@/components/rov/rov-layout";

export default function DashboardRovLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RovLayout>{children}</RovLayout>;
}
