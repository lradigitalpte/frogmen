"use client";

import { use } from "react";
import { ViewWarehousePage } from "@/components/warehouses/view-warehouse-page";

export default function WarehouseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ViewWarehousePage warehouseId={id} />;
}
