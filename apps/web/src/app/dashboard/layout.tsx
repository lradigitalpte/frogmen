import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DashboardShell } from "@/components/layout/dashboard-shell";

async function ensureActiveOrganization() {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") ?? "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  await fetch(`${appUrl}/api/v1/me/ensure-organization`, {
    method: "POST",
    headers: { cookie },
    cache: "no-store",
  });
}

async function getSessionUser() {
  try {
    const headerStore = await headers();
    const cookie = headerStore.get("cookie") ?? "";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const response = await fetch(`${appUrl}/api/auth/get-session`, {
      headers: { cookie },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data?.user ?? null;
  } catch {
    return null;
  }
}

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();

  if (!user && process.env.NODE_ENV === "production") {
    redirect("/login");
  }

  try {
    await ensureActiveOrganization();
  } catch {
    // Ignore backend connectivity errors during UI development
  }

  return <DashboardShell>{children}</DashboardShell>;
}
