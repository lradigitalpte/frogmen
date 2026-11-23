"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavPanel } from "./nav-panel";
import { useSession } from "@/lib/auth-client";
import { profileNavGroups } from "@/lib/profile-navigation";

function isProfileNavItemActive(pathname: string, href: string) {
  if (href === "/dashboard/profile") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ProfileNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  // The server never has the session, so render the fallback until hydrated.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const userName = session?.user?.name?.trim() || "Your account";
  const userEmail = session?.user?.email ?? "";

  const groups = profileNavGroups.map((group) => ({
    title: group.title,
    items: group.items.map((item) => ({
      label: item.label,
      href: item.href,
      badge: item.badge,
      disabled: item.disabled,
      active: item.href ? isProfileNavItemActive(pathname, item.href) : false,
    })),
  }));

  return <NavPanel title="Profile" subtitle={mounted ? userEmail || userName : "Your account"} groups={groups} />;
}
