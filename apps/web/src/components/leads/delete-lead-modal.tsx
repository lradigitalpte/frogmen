"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { deleteLead } from "@/lib/leads-api";
import type { Lead } from "@/types/lead";
import { AlertTriangle, Trash2, X } from "lucide-react";

interface DeleteLeadModalProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadDeleted: (id: string) => void;
}

export function DeleteLeadModal({
  lead,
  open,
  onOpenChange,
  onLeadDeleted,
}: DeleteLeadModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !lead || !mounted) return null;

  const handleDelete = () => {
    const success = deleteLead(lead.id);
    if (success) {
      onLeadDeleted(lead.id);
      onOpenChange(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in-0 duration-200"
        onClick={() => onOpenChange(false)}
      />

      {/* Confirmation Dialog Box */}
      <div className="relative z-[99999] w-full max-w-md bg-card border border-destructive/30 shadow-2xl rounded-2xl overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-destructive/15 text-destructive border border-destructive/20 shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-foreground">
                Delete Lead Record
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Confirm permanent removal of this prospect.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="rounded-xl p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-destructive/5 border border-destructive/15 text-xs text-foreground space-y-1">
          <p>
            Are you sure you want to delete lead <strong className="font-extrabold">{lead.name}</strong> ({lead.company})?
          </p>
          <p className="text-muted-foreground text-[11px]">
            This will permanently remove their record, estimated deal value (${lead.estimatedValue.toLocaleString()}), and all outreach touchpoint history. This action cannot be undone.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            className="font-bold"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Confirm Delete
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
