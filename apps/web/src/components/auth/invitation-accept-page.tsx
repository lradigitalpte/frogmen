"use client";

import { AuthLayout } from "@/components/layout/auth-layout";
import { authClient, useSession } from "@/lib/auth-client";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Spinner,
  Text,
} from "@shopify/polaris";
import { Building2, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface InvitationAcceptPageProps {
  invitationId: string;
  invitedEmail?: string;
}

export function InvitationAcceptPage({
  invitationId,
  invitedEmail = "",
}: InvitationAcceptPageProps) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invitePath = `/invite/${encodeURIComponent(invitationId)}?email=${encodeURIComponent(invitedEmail)}`;
  const authQuery = `email=${encodeURIComponent(invitedEmail)}&redirect=${encodeURIComponent(invitePath)}`;

  async function acceptInvitation() {
    setAccepting(true);
    setError(null);

    const invitation = await authClient.organization.getInvitation({
      query: { id: invitationId },
    });
    if (invitation.error) {
      setError(
        invitation.error.message ??
          "This invitation is invalid, expired, or belongs to another email.",
      );
      setAccepting(false);
      return;
    }

    const result = await authClient.organization.acceptInvitation({
      invitationId,
    });
    if (result.error) {
      setError(result.error.message ?? "Unable to accept invitation.");
      setAccepting(false);
      return;
    }

    const organizationId = invitation.data?.organizationId;
    if (organizationId) {
      await authClient.organization.setActive({ organizationId });
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (isPending) {
    return (
      <AuthLayout>
        <Card>
          <div className="invitation-accept__loading">
            <InlineStack align="center" blockAlign="center" gap="200">
              <Spinner size="small" />
              <Text as="p" tone="subdued">
                Checking invitation…
              </Text>
            </InlineStack>
          </div>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Card>
        <BlockStack gap="500">
          <div className="invitation-accept__hero">
            <div className="invitation-accept__icon">
              <Building2 aria-hidden size={25} />
            </div>
            <BlockStack gap="150">
              <InlineStack gap="150" blockAlign="center" wrap>
                <Text as="h1" variant="headingLg">
                  Join the organization
                </Text>
                <Badge tone="success">Secure invite</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                You’ve been invited to collaborate in FrogmenDash.
              </Text>
            </BlockStack>
          </div>

          {invitedEmail ? (
            <div className="invitation-accept__email">
              <Mail aria-hidden size={18} />
              <div>
                <Text as="p" tone="subdued" variant="bodySm">
                  Invitation sent to
                </Text>
                <Text as="p" fontWeight="semibold">
                  {invitedEmail}
                </Text>
              </div>
            </div>
          ) : null}

          <div className="invitation-accept__security">
            <ShieldCheck aria-hidden size={18} />
            <Text as="p" variant="bodySm">
              The invitation can only be accepted by the matching signed-in
              email address.
            </Text>
          </div>

          {error ? (
            <Banner tone="critical" title="Invitation could not be accepted">
              <p>{error}</p>
            </Banner>
          ) : null}

          {session?.user ? (
            <BlockStack gap="300">
              <div className="invitation-accept__signed-in">
                <CheckCircle2 aria-hidden size={18} />
                <Text as="p" variant="bodySm">
                  Signed in as <strong>{session.user.email}</strong>
                </Text>
              </div>
              <Button
                fullWidth
                loading={accepting}
                variant="primary"
                onClick={acceptInvitation}
              >
                Accept invitation
              </Button>
            </BlockStack>
          ) : (
            <BlockStack gap="300">
              <Button
                fullWidth
                url={`/signup?${authQuery}`}
                variant="primary"
              >
                Create account and continue
              </Button>
              <div className="invitation-accept__signin">
                <Text as="p" tone="subdued" variant="bodySm">
                  Already have an account?
                </Text>
                <Link href={`/login?${authQuery}`}>Sign in</Link>
              </div>
            </BlockStack>
          )}
        </BlockStack>
      </Card>
    </AuthLayout>
  );
}
