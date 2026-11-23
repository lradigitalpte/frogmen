"use client";

import {
  ActionList,
  Badge,
  BlockStack,
  Button,
  Card,
  EmptyState,
  IndexTable,
  Popover,
  Text,
} from "@shopify/polaris";
import { MenuHorizontalIcon } from "@shopify/polaris-icons";
import { useState } from "react";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatAppDate } from "@/lib/format-date";
import { contactStatusLabel, isFollowUpDue, sourceLabel } from "@/lib/leads-api";
import type { Lead, LeadStage } from "@/types/lead";
import { LEAD_STAGES, NEXT_STAGE, priorityTone, stageMeta } from "./lead-ui";

interface LeadTableProps {
  leads: Lead[];
  loading: boolean;
  filtered: boolean;
  onSelectLead: (lead: Lead) => void;
  onLogContact: (lead: Lead) => void;
  onEditLead: (lead: Lead) => void;
  onMoveLead: (lead: Lead, stage: LeadStage) => void;
  onDeleteLead: (lead: Lead) => void;
  onCreateLead: () => void;
}

export function LeadTable({
  leads,
  loading,
  filtered,
  onSelectLead,
  onLogContact,
  onEditLead,
  onMoveLead,
  onDeleteLead,
  onCreateLead,
}: LeadTableProps) {
  const { formatBaseMoney } = useOrgCurrency();
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  return (
    <Card padding="0">
      <IndexTable
        resourceName={{ singular: "lead", plural: "leads" }}
        itemCount={leads.length}
        selectable={false}
        loading={loading}
        emptyState={
          <EmptyState
            heading={filtered ? "No leads match these filters" : "No leads yet"}
            image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
            action={filtered ? undefined : { content: "Add lead", onAction: onCreateLead }}
          >
            <p>
              {filtered
                ? "Try a different search, or clear the filters."
                : "Add the people and companies you are trying to win as customers."}
            </p>
          </EmptyState>
        }
        headings={[
          { title: "Lead" },
          { title: "Stage" },
          { title: "Priority" },
          { title: "Source" },
          { title: "Last contact" },
          { title: "Next follow-up" },
          { title: "Value", alignment: "end" },
          { title: "", hidden: true },
        ]}
      >
        {leads.map((lead, index) => {
          const due = isFollowUpDue(lead);
          const next = NEXT_STAGE[lead.stage];
          return (
            <IndexTable.Row id={lead.id} key={lead.id} position={index} onClick={() => onSelectLead(lead)}>
              <IndexTable.Cell>
                <BlockStack gap="050">
                  <Text as="span" fontWeight="semibold">{lead.name}</Text>
                  <Text as="span" tone="subdued" variant="bodySm">
                    {lead.company}
                    {lead.jobTitle ? ` · ${lead.jobTitle}` : ""}
                  </Text>
                </BlockStack>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <span className="lead-stage-pill" style={{ ["--stage-color" as string]: stageMeta[lead.stage].color }}>
                  {stageMeta[lead.stage].label}
                </span>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Badge tone={priorityTone(lead.priority)}>
                  {lead.priority.charAt(0).toUpperCase() + lead.priority.slice(1)}
                </Badge>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" variant="bodySm">{sourceLabel(lead.leadSource)}</Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <BlockStack gap="050">
                  <Text as="span" variant="bodySm">
                    {lead.lastContactedAt ? formatAppDate(lead.lastContactedAt) : "—"}
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {contactStatusLabel(lead.contactStatus)}
                  </Text>
                </BlockStack>
              </IndexTable.Cell>
              <IndexTable.Cell>
                {lead.nextFollowUp && lead.stage !== "won" && lead.stage !== "lost" ? (
                  <Text as="span" variant="bodySm" tone={due ? "critical" : undefined} fontWeight={due ? "semibold" : undefined}>
                    {formatAppDate(lead.nextFollowUp)}
                    {due ? " · due" : ""}
                  </Text>
                ) : (
                  <Text as="span" variant="bodySm" tone="subdued">—</Text>
                )}
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" alignment="end" fontWeight="semibold" numeric>
                  {formatBaseMoney(lead.estimatedValue)}
                </Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <div onClick={(e) => e.stopPropagation()}>
                  <Popover
                    active={openMenu === lead.id}
                    onClose={() => setOpenMenu(null)}
                    preferredAlignment="right"
                    activator={
                      <Button
                        accessibilityLabel={`Actions for ${lead.name}`}
                        icon={MenuHorizontalIcon}
                        variant="tertiary"
                        onClick={() => setOpenMenu((cur) => (cur === lead.id ? null : lead.id))}
                      />
                    }
                  >
                    <ActionList
                      actionRole="menuitem"
                      onActionAnyItem={() => setOpenMenu(null)}
                      sections={[
                        {
                          items: [
                            { content: "Open", onAction: () => onSelectLead(lead) },
                            { content: "Log contact", onAction: () => onLogContact(lead) },
                            { content: "Edit details", onAction: () => onEditLead(lead) },
                          ],
                        },
                        {
                          title: "Move to",
                          items: LEAD_STAGES.filter((s) => s !== lead.stage).map((s) => ({
                            content: stageMeta[s].label + (s === next ? " (next)" : ""),
                            onAction: () => onMoveLead(lead, s),
                          })),
                        },
                        {
                          items: [{ content: "Delete", destructive: true, onAction: () => onDeleteLead(lead) }],
                        },
                      ]}
                    />
                  </Popover>
                </div>
              </IndexTable.Cell>
            </IndexTable.Row>
          );
        })}
      </IndexTable>
    </Card>
  );
}
