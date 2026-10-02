"use client";

import { BlockStack, Button, InlineStack, Select, Text } from "@shopify/polaris";
import {
  formatPaginationSummary,
  getPaginationRange,
  type PaginationResourceName,
} from "@/lib/index-table-pagination";

interface IndexTablePaginationBarProps {
  page: number;
  perPage: number;
  total: number;
  resourceName: PaginationResourceName;
  loading?: boolean;
  onPageChange: (page: number) => void;
  perPageOptions?: number[];
  onPerPageChange?: (perPage: number) => void;
  placement?: "header" | "footer";
}

export function IndexTablePaginationBar({
  page,
  perPage,
  total,
  resourceName,
  loading = false,
  onPageChange,
  perPageOptions,
  onPerPageChange,
  placement = "header",
}: IndexTablePaginationBarProps) {
  const { totalPages, page: safePage, remainingAfterPage } = getPaginationRange(
    page,
    perPage,
    total,
  );

  if (!loading && total === 0) {
    return null;
  }

  const summary = formatPaginationSummary(safePage, perPage, total, resourceName);
  const placementClass =
    placement === "footer"
      ? "index-table-pagination-bar--footer"
      : "index-table-pagination-bar--header";

  return (
    <div className={`index-table-pagination-bar ${placementClass}`}>
      <InlineStack align="space-between" blockAlign="center" wrap={false}>
        <BlockStack gap="100">
          <Text as="p" variant="bodySm" fontWeight="semibold">
            {loading && total === 0 ? "Loading…" : summary}
          </Text>
          {!loading && total > 0 && totalPages > 1 ? (
            <Text as="p" variant="bodySm" tone="subdued">
              Page {safePage} of {totalPages}
              {remainingAfterPage > 0
                ? ` · ${remainingAfterPage} not shown on this page`
                : " · Last page"}
            </Text>
          ) : null}
        </BlockStack>

        <InlineStack gap="300" blockAlign="center" wrap={false}>
          {onPerPageChange && perPageOptions?.length ? (
            <div className="index-table-pagination-bar__per-page">
              <Select
                label="Rows per page"
                labelHidden
                options={perPageOptions.map((value) => ({
                  label: `${value} per page`,
                  value: String(value),
                }))}
                value={String(perPage)}
                onChange={(value) => onPerPageChange(Number(value))}
              />
            </div>
          ) : null}
          {totalPages > 1 ? (
            <InlineStack gap="200" blockAlign="center" wrap={false}>
              <Button
                size="slim"
                disabled={safePage <= 1 || loading}
                onClick={() => onPageChange(safePage - 1)}
              >
                Previous
              </Button>
              <Button
                size="slim"
                disabled={safePage >= totalPages || loading}
                onClick={() => onPageChange(safePage + 1)}
              >
                Next
              </Button>
            </InlineStack>
          ) : null}
        </InlineStack>
      </InlineStack>
    </div>
  );
}
