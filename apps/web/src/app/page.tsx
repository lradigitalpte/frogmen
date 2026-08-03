import { redirect } from "next/navigation";
import { headers } from "next/headers";
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

export default async function HomePage() {
  const loggedIn = await hasSession();

  redirect(loggedIn ? "/dashboard" : "/login");
}
