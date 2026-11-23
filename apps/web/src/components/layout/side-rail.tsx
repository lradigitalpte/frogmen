"use client";

import { Icon, Tooltip } from "@shopify/polaris";
import { CameraIcon, ProfileIcon, SettingsIcon } from "@shopify/polaris-icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND_LOGO_SRC } from "@/lib/brand";
import {
  mainNavItems,
  profileNavLink,
  rovNavLink,
  settingsNavLink,
  type NavItem,
} from "@/lib/navigation";
import { sectionIconMap } from "@/lib/nav-icons";
import { cn } from "@/lib/utils";
import { visibleNavItems } from "@/lib/access";
import { useAccess } from "@/components/providers/access-provider";

function matches(pathname: string, url: string) {
  if (url === "/dashboard") return pathname === url;
  return pathname === url || pathname.startsWith(`${url}/`);
}

/** The top-level section that owns the current route (longest URL match). */
export function getActiveSection(pathname: string): NavItem | null {
  let best: { item: NavItem; length: number } | null = null;
  for (const item of mainNavItems) {
    for (const url of [item.url, ...(item.children?.map((child) => child.url) ?? [])]) {
      if (matches(pathname, url) && (!best || url.length > best.length)) {
        best = { item, length: url.length };
      }
    }
  }
  return best?.item ?? null;
}

export function isNavUrlActive(pathname: string, url: string) {
  return matches(pathname, url);
}

const utilityLinks = [
  { ...rovNavLink, source: CameraIcon },
  { ...profileNavLink, source: ProfileIcon },
  { ...settingsNavLink, source: SettingsIcon },
];

/** Narrow icon column: brand, one icon per section, utilities at the bottom. */
export function SideRail() {
  const pathname = usePathname();
  const active = getActiveSection(pathname);
  const { can } = useAccess();
  const sections = visibleNavItems(mainNavItems, can);

  return (
    <div className="side-rail">
      <Link className="side-rail__brand" href="/dashboard" aria-label="Dashboard home">
        <img alt="" src={BRAND_LOGO_SRC} />
      </Link>

      <nav className="side-rail__group" aria-label="Sections">
        {sections.map((item) => {
          const isActive = active?.label === item.label;
          return (
            <Tooltip content={item.label} key={item.url} preferredPosition="mostSpace" dismissOnMouseOut>
              <Link
                href={item.url}
                className={cn("side-rail__item", isActive && "is-active")}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon source={sectionIconMap[item.icon]} />
              </Link>
            </Tooltip>
          );
        })}
      </nav>

      <nav className="side-rail__group side-rail__group--bottom" aria-label="Workspace">
        {utilityLinks.filter((link) => link.url !== rovNavLink.url || can("rov.read")).map((link) => {
          const isActive = matches(pathname, link.url);
          return (
            <Tooltip content={link.label} key={link.url} dismissOnMouseOut>
              <Link
                href={link.url}
                className={cn("side-rail__item", isActive && "is-active")}
                aria-label={link.label}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon source={link.source} />
              </Link>
            </Tooltip>
          );
        })}
      </nav>
    </div>
  );
}
