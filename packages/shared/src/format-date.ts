/** Display ISO calendar dates as DD/MM/YYYY across the app and PDFs. */
export function formatAppDate(value: string | null | undefined): string {
  if (!value?.trim()) {
    return "";
  }

  const trimmed = value.trim();
  const iso = trimmed.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  const date = new Date(trimmed.includes("T") ? trimmed : `${trimmed}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/** Date + time for activity logs (date part is DD/MM/YYYY). */
export function formatAppDateTime(value: string | null | undefined): string {
  if (!value?.trim()) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const datePart = formatAppDate(value);
  const timePart = date.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}
