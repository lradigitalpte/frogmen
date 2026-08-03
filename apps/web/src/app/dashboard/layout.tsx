import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getServerAppOrigin } from "@/lib/app-origin.server";

async function ensureActiveOrganization() {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") ?? "";
  const appUrl = await getServerAppOrigin();

  await fetch(`${appUrl}/api/v1/me/ensure-organization`, {
    method: "POST",
    headers: { cookie },
    cache: "no-store",
  });
}

async function getMe() {
  try {
    const headerStore = await headers();
    const cookie = headerStore.get("cookie") ?? "";
    const appUrl = await getServerAppOrigin();

    const response = await fetch(`${appUrl}/api/v1/me`, {
      headers: { cookie },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const me = await getMe();

  if (!me?.user) {
    redirect("/login");
  }

  if (me.user.mustChangePassword) {
    redirect("/change-password-required");
  }

  try {
    await ensureActiveOrganization();
  } catch {
    // Ignore backend connectivity errors during UI development
  }

  return <DashboardShell>{children}</DashboardShell>;
}
