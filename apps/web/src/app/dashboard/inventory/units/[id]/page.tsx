"use client";

import { use } from "react";
import { ViewUnitPage } from "@/components/units/view-unit-page";

export default function UnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ViewUnitPage unitId={id} />;
}
