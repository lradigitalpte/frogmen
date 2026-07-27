"use client";

import { AppProvider } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import enTranslations from "@shopify/polaris/locales/en.json";
import type { ReactNode } from "react";
import { PolarisNextLink } from "./polaris-next-link";
import { ThemeProvider, useTheme } from "./theme-provider";
import { ToastProvider } from "./toast-provider";

interface PolarisProviderProps {
  children: ReactNode;
}

function PolarisApp({ children }: { children: ReactNode }) {
  const { theme } = useTheme();

  return (
    <AppProvider
      i18n={enTranslations}
      linkComponent={PolarisNextLink}
      theme={theme === "dark" ? "dark-experimental" : undefined}
    >
      <ToastProvider>{children}</ToastProvider>
    </AppProvider>
  );
}

export function PolarisProvider({ children }: PolarisProviderProps) {
  return (
    <ThemeProvider>
      <PolarisApp>{children}</PolarisApp>
    </ThemeProvider>
  );
}
