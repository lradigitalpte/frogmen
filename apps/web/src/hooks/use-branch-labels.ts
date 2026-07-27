"use client";

import { useEffect, useMemo, useState } from "react";
import { getMe, type SecurityContext } from "@/lib/security-api";

export function useBranchLabels() {
  const [security, setSecurity] = useState<SecurityContext | null>(null);

  useEffect(() => {
    getMe().then((result) => setSecurity(result.security)).catch(() => null);
  }, []);

  const labels = useMemo(
    () =>
      new Map(
        (security?.branches ?? []).map((branch) => [branch.id, branch.name]),
      ),
    [security],
  );

  return {
    showBranchColumn: security?.branchScope === "all",
    branchLabel: (branchId: string | null | undefined) =>
      (branchId && labels.get(branchId)) || "Unknown branch",
  };
}
