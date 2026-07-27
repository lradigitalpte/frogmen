"use client";

import type { ReactNode } from "react";

export function RovLayout({ children }: { children: ReactNode }) {
  return <div className="rov-content">{children}</div>;
}
