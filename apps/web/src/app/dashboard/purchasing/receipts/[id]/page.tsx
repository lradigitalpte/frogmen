"use client";

import { GoodsReceiptViewPage } from "@/components/purchasing/goods-receipt-view-page";
import { use } from "react";

export default function GoodsReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <GoodsReceiptViewPage receiptId={id} />;
}
