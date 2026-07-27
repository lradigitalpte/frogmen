"use client";

import { ViewCustomerPage } from "@/components/customers/view-customer-page";
import { use } from "react";

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ViewCustomerPage customerId={id} />;
}
