"use client";

import { ViewVendorPage } from "@/components/vendors/view-vendor-page";
import { use } from "react";

export default function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ViewVendorPage vendorId={id} />;
}
