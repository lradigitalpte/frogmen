"use client";

import {
  HomeIcon,
  InventoryIcon,
  CalculatorIcon,
  CartIcon,
  OrderIcon,
  PackageIcon,
  PersonIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckMarkIcon,
} from "@shopify/polaris-icons";
import { Navigation } from "@shopify/polaris";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { BRAND_LOGO_SRC } from "@/lib/brand";
import {
  mainNavItems,
  profileNavLink,
  rovNavLink,
  settingsNavLink,
  type NavIcon,
} from "@/lib/navigation";

const iconMap: Record<NavIcon, typeof HomeIcon> = {
  HomeIcon,
  PersonIcon,
  OrderIcon,
  InventoryIcon,
  CartIcon,
  CalculatorIcon,
  ShieldCheckMarkIcon,
  PackageIcon,
  SettingsIcon,
  SearchIcon,
};

function isSettingsActive(pathname: string) {
  return pathname.startsWith("/dashboard/settings");
}

function isRovActive(pathname: string) {
  return pathname.startsWith("/dashboard/rov");
}

function isProfileActive(pathname: string) {
  return pathname.startsWith("/dashboard/profile");
}

export function DashboardNav() {
  const pathname = usePathname();

  const items = useMemo(() => {
    return mainNavItems.map((item) => ({
      label: item.label,
      url: item.url,
      icon: iconMap[item.icon],
      disabled: item.disabled,
      exactMatch: item.url === "/dashboard",
      subNavigationItems: item.children?.map((child) => ({
        label: child.label,
        url: child.url,
        disabled: child.disabled,
      })),
    }));
  }, []);

  const SettingsIconComponent = iconMap[settingsNavLink.icon];
  const RovIconComponent = iconMap[rovNavLink.icon];
  const ProfileIconComponent = iconMap[profileNavLink.icon];
  const settingsActive = isSettingsActive(pathname);
  const rovActive = isRovActive(pathname);
  const profileActive = isProfileActive(pathname);

  return (
    <aside className="dashboard-nav">
      <Link className="dashboard-nav-brand" href="/dashboard">
        <img
          alt="Frogmen Technologies"
          className="dashboard-nav-brand__logo"
          src={BRAND_LOGO_SRC}
        />
      </Link>

      <div className="dashboard-nav-scroll">
        <Navigation location={pathname}>
          <Navigation.Section items={items} />
        </Navigation>
      </div>

      <div className="dashboard-nav-footer">
        <Link
          className={`dashboard-nav-footer__link${profileActive ? " is-active" : ""}`}
          href={profileNavLink.url}
        >
          <span className="dashboard-nav-footer__icon">
            <ProfileIconComponent />
          </span>
          <span>{profileNavLink.label}</span>
        </Link>
        <Link
          className={`dashboard-nav-footer__link${rovActive ? " is-active" : ""}`}
          href={rovNavLink.url}
        >
          <span className="dashboard-nav-footer__icon">
            <RovIconComponent />
          </span>
          <span>{rovNavLink.label}</span>
        </Link>
        <Link
          className={`dashboard-nav-footer__link${settingsActive ? " is-active" : ""}`}
          href={settingsNavLink.url}
        >
          <span className="dashboard-nav-footer__icon">
            <SettingsIconComponent />
          </span>
          <span>{settingsNavLink.label}</span>
        </Link>
      </div>
    </aside>
  );
}
