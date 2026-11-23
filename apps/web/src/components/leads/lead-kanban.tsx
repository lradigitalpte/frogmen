"use client";

import { Badge, Button, Icon } from "@shopify/polaris";
import { CalendarIcon, ChatIcon, ClockIcon } from "@shopify/polaris-icons";
import { useRef, useState } from "react";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatAppDate } from "@/lib/format-date";
import { isFollowUpDue, sourceLabel } from "@/lib/leads-api";
import { cn } from "@/lib/utils";
import type { Lead, LeadStage } from "@/types/lead";
import { LEAD_STAGES, NEXT_STAGE, priorityTone, stageMeta } from "./lead-ui";

interface LeadKanbanProps {
  leads: Lead[];
  movingIds: Set<string>;
  onSelectLead: (lead: Lead) => void;
  onLogContact: (lead: Lead) => void;
  onMoveLead: (lead: Lead, stage: LeadStage) => void;
}

/** Pipeline board: one column per stage, drag cards between them. */
export function LeadKanban({ leads, movingIds, onSelectLead, onLogContact, onMoveLead }: LeadKanbanProps) {
  const { formatBaseMoney } = useOrgCurrency();
  const [dragOver, setDragOver] = useState<LeadStage | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggedRef = useRef<string | null>(null);

  function drop(stage: LeadStage, id?: string) {
    const leadId = id || draggedRef.current || draggingId;
    setDragOver(null);
    setDraggingId(null);
    draggedRef.current = null;
    const lead = leads.find((l) => l.id === leadId);
    if (lead && lead.stage !== stage) onMoveLead(lead, stage);
  }

  return (
    <div className="lead-board">
      {LEAD_STAGES.map((stage) => {
        const meta = stageMeta[stage];
        const items = leads.filter((l) => l.stage === stage);
        const total = items.reduce((sum, l) => sum + (l.estimatedValue || 0), 0);

        return (
          <section
            key={stage}
            className={cn("lead-col", dragOver === stage && "is-over")}
            style={{ ["--stage-color" as string]: meta.color }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOver !== stage) setDragOver(stage);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(stage, e.dataTransfer.getData("text/plain"));
            }}
            aria-label={`${meta.label} — ${items.length} leads`}
          >
            <header className="lead-col__head">
              <span className="lead-col__dot" />
              <h3>{meta.label}</h3>
              <span className="lead-col__count">{items.length}</span>
              <span className="lead-col__value">{formatBaseMoney(total)}</span>
            </header>

            <div className="lead-col__body">
              {items.length === 0 ? (
                <div className="lead-col__empty">
                  {dragOver === stage ? "Drop here" : meta.empty}
                </div>
              ) : (
                items.map((lead) => {
                  const next = NEXT_STAGE[lead.stage];
                  const due = isFollowUpDue(lead);
                  const moving = movingIds.has(lead.id);
                  return (
                    <article
                      key={lead.id}
                      className={cn(
                        "lead-card",
                        draggingId === lead.id && "is-dragging",
                        moving && "is-moving",
                      )}
                      draggable={!moving}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", lead.id);
                        e.dataTransfer.effectAllowed = "move";
                        draggedRef.current = lead.id;
                        setDraggingId(lead.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOver(null);
                        draggedRef.current = null;
                      }}
                    >
                      <button type="button" className="lead-card__main" onClick={() => onSelectLead(lead)}>
                        <span className="lead-card__top">
                          <span className="lead-card__identity">
                            <strong>{lead.name}</strong>
                            <small>{lead.company}</small>
                          </span>
                          <Badge size="small" tone={priorityTone(lead.priority)}>
                            {lead.priority.charAt(0).toUpperCase() + lead.priority.slice(1)}
                          </Badge>
                        </span>
                        <span className="lead-card__value">{formatBaseMoney(lead.estimatedValue)}</span>
                        <span className="lead-card__meta">
                          <span className="lead-chip">{sourceLabel(lead.leadSource)}</span>
                          {lead.assignedTo?.name ? (
                            <span className="lead-chip is-muted">{lead.assignedTo.name}</span>
                          ) : null}
                        </span>
                        <span className="lead-card__foot">
                          <span>
                            <Icon source={ClockIcon} tone="subdued" />
                            {lead.lastContactedAt
                              ? `Contacted ${formatAppDate(lead.lastContactedAt)}`
                              : lead.contacted
                                ? "Contacted"
                                : "Not contacted yet"}
                          </span>
                          {lead.nextFollowUp && lead.stage !== "won" && lead.stage !== "lost" ? (
                            <span className={due ? "is-due" : undefined}>
                              <Icon source={CalendarIcon} tone={due ? "critical" : "subdued"} />
                              {due ? "Follow-up due" : `Follow up ${formatAppDate(lead.nextFollowUp)}`}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <div className="lead-card__actions">
                        <Button size="slim" variant="tertiary" icon={ChatIcon} onClick={() => onLogContact(lead)}>
                          Log contact
                        </Button>
                        {next ? (
                          <Button size="slim" variant="tertiary" disabled={moving} onClick={() => onMoveLead(lead, next)}>
                            {`${stageMeta[next].short} →`}
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
