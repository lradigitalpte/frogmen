"use client";

import type { ReactNode } from "react";

export function ProfileLayout({ children }: { children: ReactNode }) {
  return <div className="profile-content">{children}</div>;
}
