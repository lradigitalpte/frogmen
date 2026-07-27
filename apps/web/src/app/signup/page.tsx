import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { SignUpPage } from "@/components/auth/sign-up-form";

async function hasSession() {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") ?? "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

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

export default async function RegisterPage({
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
    <SignUpPage
      defaultEmail={query.email}
      redirectTo={safeRedirect}
    />
  );
}
