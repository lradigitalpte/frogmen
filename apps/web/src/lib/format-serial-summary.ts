const SERIAL_SPLIT = /\s*,\s*/;

export function parseSerialSummary(serialSummary: string) {
  return [
    ...new Set(
      serialSummary
        .split(SERIAL_SPLIT)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

/** Compact serial list for table rows (avoids wrapping dozens of units). */
export function formatSerialSummaryPreview(
  serialSummary: string,
  maxVisible = 2,
) {
  const serials = parseSerialSummary(serialSummary);
  if (serials.length === 0) return "";
  if (serials.length <= maxVisible) {
    return serials.join(", ");
  }

  const shown = serials.slice(0, maxVisible).join(", ");
  const remaining = serials.length - maxVisible;
  return `${shown} +${remaining} more`;
}

export function isSerialSummaryTruncated(
  serialSummary: string,
  maxVisible = 2,
) {
  return parseSerialSummary(serialSummary).length > maxVisible;
}
