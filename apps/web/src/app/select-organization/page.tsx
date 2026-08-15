import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { OrgSelector } from "@/components/auth/org-selector";
import { AuthLayout } from "@/components/layout/auth-layout";
import { getServerAppOrigin } from "@/lib/app-origin.server";

async function hasSession(): Promise<boolean> {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") ?? "";
  const appUrl = await getServerAppOrigin();

  const response = await fetch(`${appUrl}/api/auth/get-session`, {
    headers: { cookie },
    cache: "no-store",
  });

  if (!response.ok) return false;
  const data = await response.json();
  return Boolean(data?.user);
}

export const metadata = {
  title: "Choose Workspace – Frogmen Technologies",
  description: "Select the organization you want to work in.",
};

export default async function SelectOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const query = await searchParams;

  // Redirect unauthenticated visitors back to login.
  if (!(await hasSession())) {
    redirect("/login");
  }

  // Sanitize the redirect destination.
  const safeRedirect =
    query.redirect?.startsWith("/") && !query.redirect.startsWith("//")
      ? query.redirect
      : "/dashboard";

  return (
    <AuthLayout>
      <OrgSelector redirectTo={safeRedirect} />
    </AuthLayout>
  );
}
