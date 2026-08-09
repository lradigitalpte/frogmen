"use client";

import { useEffect, useState } from "react";
import { getMe } from "@/lib/security-api";

export function useCanViewCost() {
  const [canViewCost, setCanViewCost] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getMe()
      .then((response) => {
        setCanViewCost(response.security?.permissions.includes("cost.read") ?? false);
      })
      .catch(() => setCanViewCost(false))
      .finally(() => setLoading(false));
  }, []);

  return { canViewCost, loading };
}
