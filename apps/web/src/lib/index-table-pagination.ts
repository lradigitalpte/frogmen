export interface PaginationResourceName {
  singular: string;
  plural: string;
}

export function getPaginationRange(
  page: number,
  perPage: number,
  total: number,
) {
  if (total <= 0 || perPage <= 0) {
    return { start: 0, end: 0, totalPages: 0, page: 1, remainingAfterPage: 0 };
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * perPage + 1;
  const end = Math.min(safePage * perPage, total);
  const remainingAfterPage = Math.max(0, total - end);

  return { start, end, totalPages, page: safePage, remainingAfterPage };
}

export function formatPaginationSummary(
  page: number,
  perPage: number,
  total: number,
  resourceName: PaginationResourceName,
) {
  if (total <= 0) {
    return `No ${resourceName.plural}`;
  }

  const { start, end } = getPaginationRange(page, perPage, total);
  const noun = total === 1 ? resourceName.singular : resourceName.plural;
  return `Showing ${start}–${end} of ${total} ${noun}`;
}

export function buildIndexTablePagination(input: {
  page: number;
  perPage: number;
  total: number;
  onPageChange: (page: number) => void;
  resourceName: PaginationResourceName;
}) {
  const { page, perPage, total, onPageChange, resourceName } = input;
  const { totalPages, page: safePage, remainingAfterPage } = getPaginationRange(
    page,
    perPage,
    total,
  );
  const summary = formatPaginationSummary(safePage, perPage, total, resourceName);

  const pageLabel =
    totalPages > 1 ? `Page ${safePage} of ${totalPages}` : null;
  const remainingLabel =
    remainingAfterPage > 0
      ? `${remainingAfterPage} more after this page`
      : null;

  const labelParts = [summary, pageLabel, remainingLabel].filter(Boolean);

  return {
    hasNext: safePage < totalPages,
    hasPrevious: safePage > 1,
    onNext: () => onPageChange(safePage + 1),
    onPrevious: () => onPageChange(Math.max(1, safePage - 1)),
    label: labelParts.length ? labelParts.join(" · ") : undefined,
  };
}
