import { SettingsLayout } from "@/components/settings/settings-layout";

export default function DashboardSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingsLayout>{children}</SettingsLayout>;
}
