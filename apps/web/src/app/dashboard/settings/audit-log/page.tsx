"use client";

import {
  Badge,
  Banner,
  IndexTable,
  InlineStack,
  Pagination,
  Spinner,
  Text,
} from "@shopify/polaris";
import { useCallback, useEffect, useState } from "react";
import { AppPage, IndexSurface } from "@/components/layout/page";
import { listAuditLogs, type AuditLog } from "@/lib/security-api";

const actionLabels: Record<string, string> = {
  post: "Created",
  patch: "Updated",
  put: "Updated",
  delete: "Deleted",
};

function describeAction(value: string) {
  const [verb] = value.split(".");
  return actionLabels[verb] ?? value.replace(/[._-]/g, " ");
}

function actionTone(value: string): "success" | "attention" | "critical" | "info" {
  if (value.startsWith("post.")) return "success";
  if (value.startsWith("delete.")) return "critical";
  if (value.startsWith("patch.") || value.startsWith("put.")) return "attention";
  return "info";
}

function describeResource(value: string) {
  const labels: Record<string, string> = {
    branches: "Branch",
    members: "User & role",
    invitations: "Invitation",
    quotations: "Quotation",
    invoices: "Invoice",
    payments: "Payment",
    customers: "Customer",
    products: "Product",
    warehouses: "Warehouse",
    "purchase-orders": "Purchase order",
    "goods-receipts": "Goods receipt",
    settings: "Organization settings",
  };
  return labels[value] ?? value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AuditLogSettingsPage() {
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listAuditLogs(page, 25);
      setRows(result.data);
      setTotal(result.pagination.total);
      setTotalPages(result.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit history");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppPage
      title="Audit log"
      subtitle={`${total.toLocaleString()} immutable security and change events for your organization.`}
    >
      {error ? <Banner tone="critical">{error}</Banner> : null}
      {loading ? (
        <InlineStack align="center"><Spinner /></InlineStack>
      ) : (
        <IndexSurface>
          <IndexTable
            resourceName={{ singular: "audit event", plural: "audit events" }}
            itemCount={rows.length}
            headings={[
              { title: "Time" },
              { title: "Change" },
              { title: "Area" },
              { title: "Record" },
              { title: "Changed by" },
              { title: "Branch" },
            ]}
            selectable={false}
          >
            {rows.map((row, index) => (
              <IndexTable.Row id={row.id} key={row.id} position={index}>
                <IndexTable.Cell>
                  <Text as="span">{new Date(row.createdAt).toLocaleString()}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={actionTone(row.action)}>{describeAction(row.action)}</Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>{describeResource(row.resource)}</IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" tone="subdued">{row.recordId ? row.recordId.slice(0, 12) : " "}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <div>
                    <Text as="span" fontWeight="semibold">{row.userName ?? "System"}</Text>
                    {row.userEmail ? <Text as="p" tone="subdued" variant="bodySm">{row.userEmail}</Text> : null}
                  </div>
                </IndexTable.Cell>
                <IndexTable.Cell>{row.branchName ?? "Organization-wide"}</IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
          <div className="audit-pagination">
            <Text as="p" tone="subdued">
              Page {page} of {totalPages} · {total.toLocaleString()} events
            </Text>
            <Pagination
              hasPrevious={page > 1}
              onPrevious={() => setPage((current) => Math.max(1, current - 1))}
              hasNext={page < totalPages}
              onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
            />
          </div>
        </IndexSurface>
      )}
    </AppPage>
  );
}
