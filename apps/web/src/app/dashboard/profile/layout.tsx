import { ProfileLayout } from "@/components/profile/profile-layout";

export default function DashboardProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProfileLayout>{children}</ProfileLayout>;
}
