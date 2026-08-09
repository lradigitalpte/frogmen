"use client";

import { EditPurchaseOrderPage } from "@/components/purchasing/edit-purchase-order-page";
import { use } from "react";

export default function EditPurchaseOrderRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <EditPurchaseOrderPage orderId={id} />;
}
