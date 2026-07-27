"use client";

import { Box, Frame } from "@shopify/polaris";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import { DashboardNav } from "./dashboard-nav";
import { ProfileNav } from "./profile-nav";
import { RovNav } from "./rov-nav";
import { SettingsNav } from "./settings-nav";
import { DashboardTopBar } from "./dashboard-top-bar";

interface DashboardShellProps {
  children: ReactNode;
}

function getShellMode(pathname: string) {
  if (pathname.startsWith("/dashboard/settings")) {
    return "settings";
  }

  if (pathname.startsWith("/dashboard/rov")) {
    return "rov";
  }

  if (pathname.startsWith("/dashboard/profile")) {
    return "profile";
  }

  return "app";
}

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const shellMode = getShellMode(pathname);
  const [mobileNavigationActive, setMobileNavigationActive] = useState(false);

  const toggleMobileNavigation = useCallback(
    () => setMobileNavigationActive((active) => !active),
    [],
  );

  const navigation =
    shellMode === "settings" ? (
      <SettingsNav />
    ) : shellMode === "rov" ? (
      <RovNav />
    ) : shellMode === "profile" ? (
      <ProfileNav />
    ) : (
      <DashboardNav />
    );

  const mainClassName =
    shellMode === "settings"
      ? "app-main app-main--settings"
      : shellMode === "rov"
        ? "app-main app-main--rov"
        : shellMode === "profile"
          ? "app-main app-main--profile"
          : "app-main";

  return (
    <Frame
      logo={undefined}
      navigation={navigation}
      showMobileNavigation={mobileNavigationActive}
      topBar={
        <DashboardTopBar
          onNavigationToggle={toggleMobileNavigation}
          showNavigationToggle
        />
      }
      onNavigationDismiss={toggleMobileNavigation}
    >
      <Box background="bg-surface-secondary" minHeight="100%">
        <div className={mainClassName}>{children}</div>
      </Box>
    </Frame>
  );
}
