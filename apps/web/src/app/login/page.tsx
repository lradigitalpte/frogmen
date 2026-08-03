import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { SignInForm } from "@/components/auth/sign-in-form";
import { AuthLayout } from "@/components/layout/auth-layout";
import { getServerAppOrigin } from "@/lib/app-origin.server";

async function hasSession() {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") ?? "";
  const appUrl = await getServerAppOrigin();

  const response = await fetch(`${appUrl}/api/auth/get-session`, {
    headers: { cookie },
    cache: "no-store",
  });

  if (!response.ok) {
    return false;
  }

  const data = await response.json();
  return Boolean(data?.user);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; redirect?: string }>;
}) {
  const query = await searchParams;
  const safeRedirect =
    query.redirect?.startsWith("/") && !query.redirect.startsWith("//")
      ? query.redirect
      : "/dashboard";
  if (await hasSession()) {
    redirect(safeRedirect);
  }

  return (
    <AuthLayout>
      <SignInForm
        defaultEmail={query.email}
        redirectTo={safeRedirect}
      />
    </AuthLayout>
  );
}
