"use client";

import DOMPurify from "dompurify";
import { useEffect, useState } from "react";

export function ReportBodyContent({ content }: { content: string }) {
  const trimmed = content.trim();
  const containsHtml = /<[a-z][\s\S]*>/i.test(trimmed);
  const [sanitizedHtml, setSanitizedHtml] = useState("");

  useEffect(() => {
    setSanitizedHtml(containsHtml ? DOMPurify.sanitize(trimmed) : "");
  }, [containsHtml, trimmed]);

  if (!trimmed) return null;

  if (containsHtml) {
    return (
      <div
        className="client-report__prose"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    );
  }

  return (
    <div className="client-report__prose">
      {trimmed.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

export function severityClass(severity: string | null | undefined) {
  if (severity === "major") return "client-report__severity client-report__severity--major";
  if (severity === "moderate") return "client-report__severity client-report__severity--moderate";
  if (severity === "minor") return "client-report__severity client-report__severity--minor";
  return "client-report__severity";
}

export function formatReportDateRange(start?: string | null, end?: string | null) {
  if (!start) return null;
  const startLabel = new Date(start).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (!end) return startLabel;
  const endLabel = new Date(end).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${startLabel} – ${endLabel}`;
}

export function formatSeverityLabel(severity: string | null | undefined) {
  if (!severity) return "Not set";
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}
