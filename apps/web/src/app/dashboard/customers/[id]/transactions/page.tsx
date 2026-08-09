"use client";

import { CustomerTransactionsPage } from "@/components/customers/customer-transactions-page";
import { use } from "react";

export default function TransactionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <CustomerTransactionsPage customerId={id} />;
}
