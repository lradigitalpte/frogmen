"use client";

import { Button, Icon } from "@shopify/polaris";
import { CameraIcon } from "@shopify/polaris-icons";
import { usePathname } from "next/navigation";
import { mainNavItems, rovNavLink } from "@/lib/navigation";
import { NavPanel, type NavPanelGroup } from "./nav-panel";
import { getActiveSection, isNavUrlActive } from "./side-rail";
import { routeRule, visibleNavItems } from "@/lib/access";
import { useAccess } from "@/components/providers/access-provider";

const quickActions = [
  { label: "New quotation", href: "/dashboard/sales/quotations/new" },
  { label: "Add customer", href: "/dashboard/customers/new" },
  { label: "Register warranty", href: "/dashboard/warranty/new" },
];

/** Panel for the main app: lists the pages of the section picked in the rail. */
export function DashboardNav() {
  const pathname = usePathname();
  const { can } = useAccess();
  const owning = getActiveSection(pathname) ?? mainNavItems[0];
  // Same section, minus pages this role can't open.
  const section = visibleNavItems([owning], can)[0] ?? { ...owning, children: [] };

  // Highlight only the best (longest) matching child so parents like
  // "/dashboard/inventory" don't stay lit on "/dashboard/inventory/products".
  const children = section.children ?? [];
  const activeChildUrl = children
    .filter((child) => isNavUrlActive(pathname, child.url))
    .sort((a, b) => b.url.length - a.url.length)[0]?.url;

  const groups: NavPanelGroup[] = children.length
    ? [
        {
          items: children.map((child) => ({
            label: child.label,
            href: child.url,
            disabled: child.disabled,
            badge: child.badge,
            active: child.url === activeChildUrl,
          })),
        },
      ]
    : [
        {
          items: [
            {
              label: section.url === "/dashboard" ? "Overview" : section.label,
              href: section.url,
              active: isNavUrlActive(pathname, section.url),
            },
          ],
        },
        ...(section.url === "/dashboard"
          ? [{ title: "Quick actions", items: quickActions.filter((action) => can(routeRule(action.href))) }]
          : []),
      ];

  return (
    <NavPanel
      title={section.label}
      groups={groups}
      footer={
        <div className="dashboard-nav-promo">
          <span className="dashboard-nav-promo__icon">
            <Icon source={CameraIcon} />
          </span>
          <p className="dashboard-nav-promo__title">ROV Inspection</p>
          <p className="dashboard-nav-promo__text">
            Plan dives, log observations and publish inspection reports.
          </p>
          <Button size="slim" url={rovNavLink.url}>
            Open ROV
          </Button>
        </div>
      }
    />
  );
}
