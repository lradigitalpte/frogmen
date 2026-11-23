"use client";

import { usePathname } from "next/navigation";
import { NavPanel } from "./nav-panel";
import { rovNavGroups } from "@/lib/rov-navigation";

export function RovNav() {
  const pathname = usePathname();

  const groups = rovNavGroups.map((group) => ({
    title: group.title,
    items: group.items.map((item) => ({
      label: item.label,
      href: item.href,
      badge: item.badge,
      disabled: item.disabled,
      active: item.href
        ? item.href === "/dashboard/rov"
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`)
        : false,
    })),
  }));

  return (
    <NavPanel
      title="ROV Inspection"
      subtitle="Underwater & visual inspections"
      groups={groups}
    />
  );
}
