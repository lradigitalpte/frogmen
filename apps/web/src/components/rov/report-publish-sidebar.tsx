"use client";

import { BlockStack, Button, Card, Text } from "@shopify/polaris";

interface ChecklistItem {
  label: string;
  done: boolean;
}

interface ReportPublishSidebarProps {
  projectName: string;
  clientName?: string | null;
  location?: string | null;
  structureCount: number;
  observationCount: number;
  reportStatus: string | null;
  dirty: boolean;
  saving: boolean;
  shareUrl: string | null;
  checklist: ChecklistItem[];
  clientCanDownload: boolean;
  clientCanPrint: boolean;
  onSave: () => void;
  onShare: () => void;
  hasReport: boolean;
}

export function ReportPublishSidebar({
  projectName,
  clientName,
  location,
  structureCount,
  observationCount,
  reportStatus,
  dirty,
  saving,
  shareUrl,
  checklist,
  clientCanDownload,
  clientCanPrint,
  onSave,
  onShare,
  hasReport,
}: ReportPublishSidebarProps) {
  const completedCount = checklist.filter((item) => item.done).length;

  return (
    <BlockStack gap="400">
      <Card padding="400">
        <BlockStack gap="300">
          <BlockStack gap="100">
            <Text as="h3" variant="headingSm">
              Publish
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Save your narrative, then generate a link for your client.
            </Text>
          </BlockStack>

          <div className="rov-report-sidebar__status-row">
            {reportStatus ? (
              <span className={`rov-report-status rov-report-status--${reportStatus}`}>
                {reportStatus}
              </span>
            ) : (
              <span className="rov-report-status rov-report-status--draft">not created</span>
            )}
            <Text as="span" tone={dirty ? "caution" : "success"} variant="bodySm">
              {dirty ? "Unsaved" : "Saved"}
            </Text>
          </div>

          <BlockStack gap="200">
            <Button
              variant="primary"
              fullWidth
              loading={saving}
              disabled={!dirty || saving}
              onClick={onSave}
            >
              {hasReport ? "Save changes" : "Create report"}
            </Button>
            <Button fullWidth loading={saving} onClick={onShare}>
              {shareUrl ? "Refresh share link" : "Generate share link"}
            </Button>
            {shareUrl ? (
              <>
                <Button fullWidth url={shareUrl} external target="_blank">
                  Preview as client
                </Button>
                <Button
                  fullWidth
                  onClick={() => void navigator.clipboard.writeText(shareUrl)}
                >
                  Copy share link
                </Button>
              </>
            ) : null}
          </BlockStack>

          {shareUrl ? (
            <div className="rov-report-builder__share-box">
              <Text as="p" variant="bodySm" fontWeight="semibold">
                Client link
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {shareUrl}
              </Text>
            </div>
          ) : null}
        </BlockStack>
      </Card>

      <Card padding="400">
        <BlockStack gap="300">
          <InlineStackHeader
            title="Report sections"
            subtitle={`${completedCount} of ${checklist.length} complete`}
          />
          <ul className="rov-report-sidebar__checklist">
            {checklist.map((item) => (
              <li
                key={item.label}
                className={
                  item.done
                    ? "rov-report-sidebar__checklist-item rov-report-sidebar__checklist-item--done"
                    : "rov-report-sidebar__checklist-item"
                }
              >
                <span className="rov-report-sidebar__check" aria-hidden>
                  {item.done ? "✓" : "○"}
                </span>
                {item.label}
              </li>
            ))}
          </ul>
        </BlockStack>
      </Card>

      <Card padding="400">
        <BlockStack gap="300">
          <InlineStackHeader title="Included on client link" />
          <dl className="rov-report-sidebar__stats">
            <div>
              <dt>Project</dt>
              <dd>{projectName}</dd>
            </div>
            {clientName ? (
              <div>
                <dt>Client</dt>
                <dd>{clientName}</dd>
              </div>
            ) : null}
            {location ? (
              <div>
                <dt>Location</dt>
                <dd>{location}</dd>
              </div>
            ) : null}
            <div>
              <dt>Structures</dt>
              <dd>{structureCount}</dd>
            </div>
            <div>
              <dt>Observations</dt>
              <dd>{observationCount}</dd>
            </div>
            <div>
              <dt>Client access</dt>
              <dd>
                {[clientCanDownload ? "PDF" : null, clientCanPrint ? "Print" : null]
                  .filter(Boolean)
                  .join(" · ") || "View only"}
              </dd>
            </div>
          </dl>
          <Text as="p" tone="subdued" variant="bodySm">
            Diagrams, pins, and linked media are pulled from your project
            automatically   they do not need to be copied into the text fields.
          </Text>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

function InlineStackHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <BlockStack gap="050">
      <Text as="h3" variant="headingSm">
        {title}
      </Text>
      {subtitle ? (
        <Text as="p" tone="subdued" variant="bodySm">
          {subtitle}
        </Text>
      ) : null}
    </BlockStack>
  );
}
