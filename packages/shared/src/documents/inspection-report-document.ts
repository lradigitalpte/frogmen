import { severityLabel } from "../severity";

export interface InspectionReportPayload {
  report: {
    id: string;
    title: string | null;
    summary: string | null;
    fullReport: string | null;
    conclusions: string | null;
    recommendations: string | null;
    status: string;
    sharedDate: string | null;
    expiresAt: string | null;
    clientCanDownload: boolean;
    clientCanPrint: boolean;
  };
  project: {
    id: string;
    name: string;
    location: string | null;
    latitude: string | null;
    longitude: string | null;
    startDate: string | null;
    endDate: string | null;
    planViewUrl: string | null;
    siteMapUrl: string | null;
    customer: { name: string } | null;
    structures: Array<{
      id: string;
      name: string;
      description: string | null;
      photoUrl: string | null;
      diagramUrl: string | null;
      views: Array<{
        id: string;
        name: string;
        viewType: string;
        points: Array<{
          id: string;
          observationId: string | null;
          pointNumber: number | null;
          label: string | null;
          severity: string;
          findingType: string | null;
          description: string | null;
          diveLocation: string | null;
          depthM: string | null;
          dimensionMm: string | null;
          recommendations: string | null;
          xCoordinate: number | null;
          yCoordinate: number | null;
          media: Array<{
            id: string;
            fileName: string;
            mediaType: string;
            url: string | null;
            thumbnailUrl: string | null;
          }>;
        }>;
      }>;
      unlinkedMedia: Array<{
        id: string;
        fileName: string;
        mediaType: string;
        url: string | null;
        thumbnailUrl: string | null;
      }>;
    }>;
  } | null;
  severityCounts: {
    major: number;
    moderate: number;
    minor: number;
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function severityClass(severity: string): string {
  const key = severity.toLowerCase();
  if (key === "major" || key === "critical" || key === "high") return "major";
  if (key === "moderate" || key === "medium") return "moderate";
  return "minor";
}

type ReportMedia = {
  fileName: string;
  mediaType: string;
  url: string | null;
};

function renderMediaList(media: ReportMedia[]): string {
  if (!media.length) {
    return '<span class="muted">No linked media</span>';
  }

  const items = media
    .map((item) => {
      const link = item.url
        ? ` - <a href="${escapeHtml(item.url)}">Open media file</a>`
        : "";
      return `<li>${escapeHtml(item.fileName)} (${escapeHtml(item.mediaType)})${link}</li>`;
    })
    .join("");

  return `<ul class="media-list">${items}</ul>`;
}

function renderStructureSections(
  structures: NonNullable<InspectionReportPayload["project"]>["structures"],
): string {
  if (!structures.length) {
    return '<div class="card muted">No structure data available for this report.</div>';
  }

  return structures
    .map((structure) => {
      const viewSections = structure.views.length
        ? structure.views
            .map((view) => {
              const pointRows = view.points.length
                ? view.points
                    .map((point) => {
                      const id =
                        point.observationId ??
                        (point.pointNumber
                          ? `Point ${point.pointNumber}`
                          : "—");
                      const depth = point.depthM ? `${point.depthM} m` : "—";
                      const pin =
                        point.xCoordinate != null && point.yCoordinate != null
                          ? `${point.xCoordinate}%, ${point.yCoordinate}%`
                          : "—";

                      return `<tr>
                        <td>${escapeHtml(id)}</td>
                        <td><span class="pill ${severityClass(point.severity)}">${escapeHtml(severityLabel(point.severity))}</span></td>
                        <td>
                          <div><strong>${escapeHtml(point.findingType ?? "—")}</strong></div>
                          ${point.description ? `<div class="muted">${escapeHtml(point.description)}</div>` : ""}
                          ${point.dimensionMm ? `<div class="small">Dimension: ${escapeHtml(point.dimensionMm)}</div>` : ""}
                          ${point.recommendations ? `<div class="small">Recommendation: ${escapeHtml(point.recommendations)}</div>` : ""}
                        </td>
                        <td>
                          <div>${escapeHtml(point.diveLocation ?? "—")}</div>
                          <div class="small muted">Depth: ${escapeHtml(depth)}</div>
                          <div class="small muted">Pin: ${escapeHtml(pin)}</div>
                        </td>
                        <td>${renderMediaList(point.media)}</td>
                      </tr>`;
                    })
                    .join("")
                : '<tr><td colspan="5" class="muted">No observations in this view.</td></tr>';

              return `<div class="view-title">${escapeHtml(view.name)} (${escapeHtml(view.viewType.charAt(0).toUpperCase() + view.viewType.slice(1))})</div>
                <table class="obs-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Severity</th>
                      <th>Type / Description</th>
                      <th>Location / Depth</th>
                      <th>Media</th>
                    </tr>
                  </thead>
                  <tbody>${pointRows}</tbody>
                </table>`;
            })
            .join("")
        : '<div class="muted">No views configured for this structure.</div>';

      const unlinkedMedia = structure.unlinkedMedia.length
        ? `<div class="view-title">Unlinked Structure Media</div>
          <ul class="media-list">
            ${structure.unlinkedMedia
              .map((media) => {
                const link = media.url
                  ? ` - <a href="${escapeHtml(media.url)}">Open media file</a>`
                  : "";
                return `<li>${escapeHtml(media.fileName)} (${escapeHtml(media.mediaType)})${link}</li>`;
              })
              .join("")}
          </ul>`
        : "";

      return `<div class="card">
        <div class="structure-title">${escapeHtml(structure.name)}</div>
        ${structure.description ? `<div class="muted" style="margin-bottom:6px;">${escapeHtml(structure.description)}</div>` : ""}
        ${structure.diagramUrl ? `<div class="small"><strong>Diagram:</strong> <a href="${escapeHtml(structure.diagramUrl)}">Open structure diagram</a></div>` : ""}
        ${structure.photoUrl ? `<div class="small"><strong>Photo:</strong> <a href="${escapeHtml(structure.photoUrl)}">Open structure photo</a></div>` : ""}
        ${viewSections}
        ${unlinkedMedia}
      </div>`;
    })
    .join("");
}

export function renderInspectionReportDocumentHtml(
  payload: InspectionReportPayload,
): string {
  const { report, project, severityCounts } = payload;
  const title = report.title ?? "Inspection Report";
  const coordinates =
    project?.latitude && project?.longitude
      ? `${project.latitude}, ${project.longitude}`
      : "—";
  const inspectionDates =
    project?.startDate != null
      ? `${formatDate(project.startDate)}${project.endDate ? ` - ${formatDate(project.endDate)}` : ""}`
      : "—";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)} PDF</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; font-size: 12px; line-height: 1.45; margin: 28px; }
    h1, h2, h3 { margin: 0; }
    .header { border-bottom: 2px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 20px; }
    .header-table { width: 100%; border-collapse: collapse; }
    .header-table td { vertical-align: top; }
    .eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: 1.4px; color: #2563eb; font-weight: bold; }
    .title { font-size: 24px; font-weight: bold; margin-top: 4px; }
    .meta { margin-top: 6px; color: #475569; font-size: 11px; }
    .header-meta-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .header-meta-table td { width: 50%; padding: 6px 8px; border: 1px solid #e2e8f0; }
    .header-meta-label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: bold; display: block; margin-bottom: 2px; }
    .section { margin-top: 22px; }
    .section-title { font-size: 15px; font-weight: bold; margin-bottom: 10px; color: #0f172a; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 10px; }
    .stats { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .stats td { width: 33.33%; border: 1px solid #e2e8f0; padding: 10px; text-align: center; }
    .stats .count { font-size: 22px; font-weight: bold; display: block; }
    .muted { color: #64748b; }
    .small { font-size: 10px; }
    .structure-title { font-size: 13px; font-weight: bold; margin-bottom: 4px; }
    .view-title { font-size: 12px; font-weight: bold; margin: 10px 0 6px; color: #1e293b; }
    .obs-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    .obs-table th, .obs-table td { border: 1px solid #e2e8f0; padding: 7px 8px; vertical-align: top; }
    .obs-table th { background: #f8fafc; text-align: left; font-size: 10px; text-transform: uppercase; color: #64748b; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: bold; }
    .major { background: #fee2e2; color: #b91c1c; }
    .moderate { background: #ffedd5; color: #c2410c; }
    .minor { background: #fef3c7; color: #a16207; }
    .media-list { margin: 6px 0 0 16px; padding: 0; }
    .media-list li { margin-bottom: 4px; }
    a { color: #2563eb; text-decoration: none; }
    .footer { margin-top: 28px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <table class="header-table">
      <tr>
        <td>
          <div class="eyebrow">Frogmen Technologies</div>
          <div class="title">${escapeHtml(title)}</div>
          <div class="meta">
            ROV Inspection Report
            ${project?.name ? `| Project: ${escapeHtml(project.name)}` : ""}
            ${report.sharedDate ? `| Generated: ${escapeHtml(formatDate(report.sharedDate))}` : ""}
          </div>
        </td>
      </tr>
    </table>

    <table class="header-meta-table">
      <tr>
        <td>
          <span class="header-meta-label">Created For</span>
          ${escapeHtml(project?.customer?.name ?? "Client Not Set")}
        </td>
        <td>
          <span class="header-meta-label">Report Status</span>
          ${escapeHtml(report.status ? report.status.charAt(0).toUpperCase() + report.status.slice(1) : "—")}
        </td>
      </tr>
      <tr>
        <td>
          <span class="header-meta-label">Location</span>
          ${escapeHtml(project?.location ?? "—")}
        </td>
        <td>
          <span class="header-meta-label">Inspection Dates</span>
          ${escapeHtml(inspectionDates)}
        </td>
      </tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Summary</div>
    <div class="card">${escapeHtml(report.summary?.trim() || "No executive summary provided.")}</div>
    <table class="stats">
      <tr>
        <td><span class="count" style="color:#b91c1c;">${severityCounts.major}</span><span class="small muted">Major</span></td>
        <td><span class="count" style="color:#c2410c;">${severityCounts.moderate}</span><span class="small muted">Moderate</span></td>
        <td><span class="count" style="color:#a16207;">${severityCounts.minor}</span><span class="small muted">Minor</span></td>
      </tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Project Details</div>
    <div class="card">
      <div><strong>Customer:</strong> ${escapeHtml(project?.customer?.name ?? "—")}</div>
      <div><strong>Project:</strong> ${escapeHtml(project?.name ?? "—")}</div>
      <div><strong>Location:</strong> ${escapeHtml(project?.location ?? "—")}</div>
      <div><strong>Coordinates:</strong> ${escapeHtml(coordinates)}</div>
      <div><strong>Inspection Dates:</strong> ${escapeHtml(inspectionDates)}</div>
      ${project?.planViewUrl ? `<div><strong>Plan View:</strong> <a href="${escapeHtml(project.planViewUrl)}">Open plan view</a></div>` : ""}
      ${project?.siteMapUrl ? `<div><strong>Site Map:</strong> <a href="${escapeHtml(project.siteMapUrl)}">Open site map</a></div>` : ""}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Structures, Views, and Observations</div>
    ${renderStructureSections(project?.structures ?? [])}
  </div>

  ${report.fullReport ? `<div class="section"><div class="section-title">Full Report</div><div class="card">${report.fullReport}</div></div>` : ""}
  ${report.conclusions ? `<div class="section"><div class="section-title">Conclusions</div><div class="card">${escapeHtml(report.conclusions)}</div></div>` : ""}
  ${report.recommendations ? `<div class="section"><div class="section-title">Recommendations</div><div class="card">${escapeHtml(report.recommendations)}</div></div>` : ""}

  <div class="footer">Generated from FrogmenDash client report share link.</div>
</body>
</html>`;
}
