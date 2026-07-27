"use client";

import type { ReactNode } from "react";

export function SettingsLayout({ children }: { children: ReactNode }) {
  return <div className="settings-content">{children}</div>;
}
