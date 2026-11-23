"use client";

import { Suspense } from "react";
import { AlertsPage } from "@/components/alerts/alerts-page";

export default function AlertsRoutePage() {
  return (
    <Suspense fallback={null}>
      <AlertsPage />
    </Suspense>
  );
}
