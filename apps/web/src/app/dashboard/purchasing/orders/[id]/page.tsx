"use client";

import { PurchaseOrderViewPage } from "@/components/purchasing/purchase-order-view-page";
import { use } from "react";

export default function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <PurchaseOrderViewPage orderId={id} />;
}
