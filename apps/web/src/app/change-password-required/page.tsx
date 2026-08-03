import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ChangePasswordRequiredForm } from "@/components/auth/change-password-required-form";
import { getServerAppOrigin } from "@/lib/app-origin.server";

async function getMe() {
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
}

export default async function ChangePasswordRequiredPage() {
  const me = await getMe();

  if (!me?.user) {
    redirect("/login");
  }

  if (!me.user.mustChangePassword) {
    redirect("/dashboard");
  }

  return <ChangePasswordRequiredForm />;
}
