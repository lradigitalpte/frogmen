"use client";

import type { Logo } from "@shopify/polaris/build/ts/src/utilities/frame/types";
import { BRAND_LOGO_SRC } from "@/lib/brand";

const frameLogo: Logo = {
  topBarSource: BRAND_LOGO_SRC,
  contextualSaveBarSource: BRAND_LOGO_SRC,
  url: "/dashboard",
  accessibilityLabel: "Frogmen Technologies",
  width: 120,
};

export function useDashboardFrameLogo(): Logo {
  return frameLogo;
}
