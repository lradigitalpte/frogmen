"use client";

import { EditVendorPage } from "@/components/vendors/view-vendor-page";
import { use } from "react";

export default function EditVendorRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <EditVendorPage vendorId={id} />;
}
