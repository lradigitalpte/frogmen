"use client";

import { StatusBadge } from "@/components/ui/status-badge";
import {
  contactStatusLabel,
  contactStatusVariant,
  deleteLead,
  priorityBadgeVariant,
  priorityLabel,
  sourceBadgeVariant,
  sourceLabel,
  stageBadgeVariant,
  stageLabel,
  updateLeadStage,
} from "@/lib/leads-api";
import type { Lead, LeadStage } from "@/types/lead";
import { Building2, Calendar, Clock, Eye, Mail, MessageSquare, MoreHorizontal, Phone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrgCurrency } from "@/hooks/use-org-currency";

interface LeadTableProps {
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
  onLogContact: (lead: Lead) => void;
  onLeadUpdated: (lead: Lead) => void;
  onLeadDeleted: (id: string, lead: Lead) => void;
}

const STAGES: LeadStage[] = ["new", "contacted", "qualified", "proposal", "won", "lost"];

export function LeadTable({
  leads,
  onSelectLead,
  onLogContact,
  onLeadUpdated,
  onLeadDeleted,
}: LeadTableProps) {
  const { formatBaseMoney } = useOrgCurrency();
  if (leads.length === 0) {
    return (
      <div className="text-center py-12 border rounded-xl bg-card">
        <p className="text-muted-foreground text-sm font-medium">
          No leads match your current search or filter criteria.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-xl bg-card overflow-x-auto shadow-xs">
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <th className="py-3 px-4">Contact & Company</th>
            <th className="py-3 px-4">Lead Origin Source</th>
            <th className="py-3 px-4">Contacted Status</th>
            <th className="py-3 px-4">Stage</th>
            <th className="py-3 px-4">Priority</th>
            <th className="py-3 px-4">Est. Value</th>
            <th className="py-3 px-4">Follow-Up</th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {leads.map((lead) => {
            const isFollowUpOverdue =
              lead.nextFollowUp &&
              lead.nextFollowUp <= new Date().toISOString() &&
              lead.stage !== "won" &&
              lead.stage !== "lost";

            return (
              <tr
                key={lead.id}
                className="hover:bg-muted/30 transition-colors group cursor-pointer"
                onClick={() => onSelectLead(lead)}
              >
                {/* Contact & Company */}
                <td className="py-3 px-4">
                  <div className="font-bold text-foreground group-hover:text-primary transition-colors">
                    {lead.name}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Building2 className="h-3 w-3" />
                    <span>{lead.company}</span>
                    {lead.jobTitle && <span className="text-muted-foreground/70">• {lead.jobTitle}</span>}
                  </div>
                </td>

                {/* Lead Origin Source */}
                <td className="py-3 px-4">
                  <div className="space-y-1">
                    <StatusBadge variant={sourceBadgeVariant(lead.leadSource)}>
                      {sourceLabel(lead.leadSource)}
                    </StatusBadge>
                    {lead.sourceDetails && (
                      <p className="text-[11px] text-muted-foreground line-clamp-1 max-w-[200px]" title={lead.sourceDetails}>
                        {lead.sourceDetails}
                      </p>
                    )}
                  </div>
                </td>

                {/* Contacted Status & Touchpoint */}
                <td className="py-3 px-4">
                  <div className="space-y-1">
                    <StatusBadge variant={contactStatusVariant(lead.contactStatus)}>
                      {contactStatusLabel(lead.contactStatus)}
                    </StatusBadge>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {lead.lastContactedAt
                        ? new Date(lead.lastContactedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : lead.contacted
                          ? "Recorded"
                          : "Not Contacted"}
                    </div>
                  </div>
                </td>

                {/* Stage */}
                <td className="py-3 px-4">
                  <select
                    className="text-xs font-semibold rounded border border-input bg-background px-2 py-1 focus:outline-none"
                    value={lead.stage}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const updated = updateLeadStage(lead.id, e.target.value as LeadStage);
                      if (updated) onLeadUpdated(updated);
                    }}
                  >
                    {STAGES.map((stg) => (
                      <option key={stg} value={stg}>
                        {stageLabel(stg)}
                      </option>
                    ))}
                  </select>
                </td>

                {/* Priority */}
                <td className="py-3 px-4">
                  <StatusBadge variant={priorityBadgeVariant(lead.priority)}>
                    {priorityLabel(lead.priority)}
                  </StatusBadge>
                </td>

                {/* Est. Value */}
                <td className="py-3 px-4 font-bold text-frogmen-emerald">
                  {formatBaseMoney(lead.estimatedValue)}
                </td>

                {/* Follow-Up Date */}
                <td className="py-3 px-4">
                  {lead.nextFollowUp ? (
                    <span
                      className={`text-xs flex items-center gap-1 font-medium ${
                        isFollowUpOverdue ? "text-destructive font-bold" : "text-muted-foreground"
                      }`}
                    >
                      <Calendar className="h-3 w-3" />
                      {new Date(lead.nextFollowUp).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                      {isFollowUpOverdue && (
                        <span className="bg-destructive/15 text-destructive text-[10px] px-1.5 py-0.2 rounded font-bold">
                          DUE
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/60">—</span>
                  )}
                </td>

                {/* Actions */}
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="xs"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => onLogContact(lead)}
                    >
                      <MessageSquare className="h-3.5 w-3.5 mr-1" /> Touchpoint
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="View Details"
                      onClick={() => onSelectLead(lead)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                      title="Delete Lead"
                      onClick={() => onLeadDeleted(lead.id, lead)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
