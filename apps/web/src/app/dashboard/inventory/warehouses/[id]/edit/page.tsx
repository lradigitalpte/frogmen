"use client";

import { use } from "react";
import { EditWarehousePage } from "@/components/warehouses/edit-warehouse-page";

export default function EditWarehouseRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <EditWarehousePage warehouseId={id} />;
}
