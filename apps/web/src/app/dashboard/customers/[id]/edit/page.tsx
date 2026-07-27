"use client";

import { EditCustomerPage } from "@/components/customers/edit-customer-page";
import { use } from "react";

export default function CustomerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <EditCustomerPage customerId={id} />;
}
