"use client";

import { Badge, BlockStack, Card, Text } from "@shopify/polaris";
import { Building2, Calendar, Globe, MapPin, User } from "lucide-react";
import { useRovAssetSrc } from "./use-rov-asset-src";
import type { RovProject, RovProjectStatus } from "@/types/rov";

function formatStatus(status: RovProjectStatus) {
  if (status === "in_progress") return "In progress";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusTone(
  status: RovProjectStatus,
): "success" | "warning" | "info" | "attention" | undefined {
  if (status === "completed") return "success";
  if (status === "in_progress") return "warning";
  if (status === "archived") return "info";
  if (status === "draft") return "attention";
  return undefined;
}

function formatDate(value: string | null | undefined) {
  if (!value) return " ";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return " ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface DetailFieldProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
}

function DetailField({ label, value, icon }: DetailFieldProps) {
  return (
    <div className="rov-project-detail__field">
      <Text as="p" variant="bodySm" tone="subdued">
        {label}
      </Text>
      <div className="rov-project-detail__field-value">
        {icon ? <span className="rov-project-detail__field-icon">{icon}</span> : null}
        <Text as="p" variant="bodyMd" fontWeight="medium">
          {value}
        </Text>
      </div>
    </div>
  );
}

interface RovProjectSummaryProps {
  project: RovProject;
  companyName?: string;
}

export function RovProjectSummary({ project, companyName }: RovProjectSummaryProps) {
  const structureCount = project.structures?.length ?? 0;
  const planPath = project.planViewPath ?? project.siteMapPath;
  const { src: projectImageUrl } = useRovAssetSrc(planPath);
  const hasProjectImage = Boolean(planPath);
  const hasGps = Boolean(project.latitude && project.longitude);
  const scheduleLabel =
    project.startDate || project.endDate
      ? `${formatDate(project.startDate)} – ${formatDate(project.endDate)}`
      : "Not scheduled";

  return (
    <div className="rov-project-detail__summary">
      <div className="rov-project-detail__stats">
        <div className="rov-project-detail__stat">
          <span className="rov-project-detail__stat-icon">
            <Building2 size={18} />
          </span>
          <div>
            <Text as="p" variant="headingLg">
              {structureCount}
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Structures
            </Text>
          </div>
        </div>

        <div className="rov-project-detail__stat">
          <span className="rov-project-detail__stat-icon">
            <Calendar size={18} />
          </span>
          <div>
            <Text as="p" variant="bodyMd" fontWeight="semibold">
              {scheduleLabel}
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Inspection schedule
            </Text>
          </div>
        </div>

        <div className="rov-project-detail__stat">
          <span className="rov-project-detail__stat-icon">
            <Globe size={18} />
          </span>
          <div>
            <Text as="p" variant="bodyMd" fontWeight="semibold">
              {hasGps ? `${project.latitude}, ${project.longitude}` : "Not set"}
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              GPS coordinates
            </Text>
          </div>
        </div>

        <div className="rov-project-detail__stat">
          <span className="rov-project-detail__stat-icon">
            <MapPin size={18} />
          </span>
          <div>
            <Text as="p" variant="bodyMd" fontWeight="semibold">
              {hasProjectImage ? "Uploaded" : "Missing"}
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Plan view drawing
            </Text>
          </div>
        </div>
      </div>

      <div className="rov-project-detail__panels">
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Project information
            </Text>
            <div className="rov-project-detail__field-grid">
              <DetailField label="Project name" value={project.name} />
              <DetailField
                label="Description"
                value={project.description?.trim() || " "}
              />
            </div>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Details
            </Text>
            <div className="rov-project-detail__field-grid rov-project-detail__field-grid--two">
              <DetailField
                label="Site location"
                value={project.location?.trim() || " "}
                icon={<MapPin size={16} />}
              />
              <DetailField
                label="Client / customer"
                value={project.customerName?.trim() || " "}
                icon={<User size={16} />}
              />
              <DetailField
                label="Start date"
                value={formatDate(project.startDate)}
                icon={<Calendar size={16} />}
              />
              <DetailField
                label="End date"
                value={formatDate(project.endDate)}
                icon={<Calendar size={16} />}
              />
            </div>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Status & assignment
            </Text>
            <div className="rov-project-detail__field-grid">
              <div className="rov-project-detail__field">
                <Text as="p" variant="bodySm" tone="subdued">
                  Status
                </Text>
                <Badge tone={statusTone(project.status)}>
                  {formatStatus(project.status)}
                </Badge>
              </div>
              <DetailField label="Company" value={companyName?.trim() || " "} />
              <DetailField
                label="Created by"
                value={project.creatorName?.trim() || " "}
              />
              <DetailField
                label="Created"
                value={formatDateTime(project.createdAt)}
              />
              <DetailField
                label="Last updated"
                value={formatDateTime(project.updatedAt)}
              />
            </div>
          </BlockStack>
        </Card>
      </div>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            Plan view
          </Text>
          <Text as="p" tone="subdued" variant="bodySm">
            Top-down CAD or site map shown in client reports.
          </Text>
          {projectImageUrl ? (
            <div className="rov-project-detail__plan-preview">
              <img src={projectImageUrl} alt="Plan view" />
            </div>
          ) : (
            <div className="rov-project-detail__plan-empty">
              <Text as="p" tone="subdued">
                No plan view drawing uploaded yet.
              </Text>
            </div>
          )}
        </BlockStack>
      </Card>
    </div>
  );
}

export { formatStatus, statusTone };
