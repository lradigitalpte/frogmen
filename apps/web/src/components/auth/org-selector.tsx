"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, BlockStack, Button, Spinner, Text } from "@shopify/polaris";
import { BuildingIcon, ArrowRight, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";

interface Org {
  id: string;
  name: string;
  slug: string;
}

interface OrgSelectorProps {
  redirectTo?: string;
}

export function OrgSelector({ redirectTo = "/dashboard" }: OrgSelectorProps) {
  const router = useRouter();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authClient.organization
      .list()
      .then((result) => {
        const list = (result.data ?? []) as Org[];
        if (list.length === 1) {
          // Only one org — no need to show selector, jump straight in.
          router.replace(redirectTo);
          return;
        }
        setOrgs(list);
      })
      .catch(() => setError("Failed to load your organizations. Please try again."))
      .finally(() => setLoading(false));
  }, [redirectTo, router]);

  async function handleSelect(orgId: string) {
    setSwitching(orgId);
    setError(null);
    try {
      await authClient.organization.setActive({ organizationId: orgId });
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Could not switch to that organization. Please try again.");
      setSwitching(null);
    }
  }

  if (loading) {
    return (
      <div className="org-selector-loading">
        <Spinner size="large" />
        <Text as="p" tone="subdued">
          Loading your workspaces…
        </Text>
      </div>
    );
  }

  return (
    <div className="auth-form-card org-selector-card">
      <BlockStack gap="500">
        {/* Header */}
        <div className="auth-form-heading">
          <span>
            <ShieldCheck size={20} />
          </span>
          <div>
            <Text as="h1" variant="headingXl">
              Choose your workspace
            </Text>
            <Text as="p" tone="subdued">
              Your account belongs to multiple organizations. Select one to continue.
            </Text>
          </div>
        </div>

        {error ? <Banner tone="critical">{error}</Banner> : null}

        {/* Org cards */}
        <div className="org-selector-list">
          {orgs.map((org) => {
            const isSwitching = switching === org.id;
            const isDisabled = switching !== null && !isSwitching;
            return (
              <button
                key={org.id}
                type="button"
                className={`org-selector-item${isSwitching ? " org-selector-item--active" : ""}${isDisabled ? " org-selector-item--disabled" : ""}`}
                onClick={() => handleSelect(org.id)}
                disabled={isDisabled || isSwitching}
                aria-label={`Enter ${org.name} workspace`}
              >
                <span className="org-selector-item__icon">
                  <BuildingIcon size={22} />
                </span>
                <span className="org-selector-item__body">
                  <strong className="org-selector-item__name">{org.name}</strong>
                  <span className="org-selector-item__slug">{org.slug}</span>
                </span>
                <span className="org-selector-item__action">
                  {isSwitching ? (
                    <Spinner size="small" />
                  ) : (
                    <ArrowRight size={18} />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <Button
          variant="plain"
          onClick={async () => {
            const { signOut } = authClient;
            await signOut();
            router.push("/login");
          }}
        >
          Sign out
        </Button>
      </BlockStack>
    </div>
  );
}
