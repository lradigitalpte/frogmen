"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavPanel } from "./nav-panel";
import { getCompanySettings } from "@/lib/settings-api";
import { settingsNavGroups } from "@/lib/settings-navigation";
import { getMe } from "@/lib/security-api";

export function SettingsNav() {
  const pathname = usePathname();
  const [companyName, setCompanyName] = useState("Organization");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    getCompanySettings()
      .then((company) => {
        if (company.name?.trim()) {
          setCompanyName(company.name.trim());
        }
      })
      .catch(() => {
        // Keep defaults
      });
  }, []);

  useEffect(() => {
    getMe()
      .then((result) => {
        setPermissions(result.security?.permissions ?? []);
        setIsPlatformAdmin(Boolean(result.isPlatformAdmin));
      })
      .catch(() => {
        setPermissions([]);
        setIsPlatformAdmin(false);
      });
  }, []);

  const groups = settingsNavGroups.map((group) => ({
    title: group.title,
    items: group.items
      .filter(
        (item) =>
          !(item.platformAdmin && !isPlatformAdmin) &&
          !(item.permission && !permissions.includes(item.permission)),
      )
      .map((item) => ({
        label: item.label,
        href: item.href,
        badge: item.badge,
        disabled: item.disabled,
        active: item.href
          ? pathname === item.href || pathname.startsWith(`${item.href}/`)
          : false,
      })),
  }));

  return <NavPanel title="Settings" subtitle={companyName} groups={groups} />;
}
