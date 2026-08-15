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
import { useEffect, useRef, useState } from "react";

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
  const autoAcceptStarted = useRef(false);
  const invitePath = `/invite/${encodeURIComponent(invitationId)}?email=${encodeURIComponent(invitedEmail)}`;
  const authQuery = `email=${encodeURIComponent(invitedEmail)}&redirect=${encodeURIComponent(invitePath)}`;

  async function completeInvitation(organizationId?: string | null) {
    if (organizationId) {
      await authClient.organization.setActive({ organizationId });
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function acceptInvitation() {
    setAccepting(true);
    setError(null);

    const invitation = await authClient.organization.getInvitation({
      query: { id: invitationId },
    });

    const organizationId = invitation.data?.organizationId;
    const status = invitation.data?.status;

    // Check if user is already a member of this organization
    try {
      const orgsResult = await authClient.organization.list();
      const userOrgs = orgsResult.data ?? [];
      const alreadyMember =
        organizationId && userOrgs.some((o) => o.id === organizationId);

      if ((status === "accepted" || alreadyMember) && organizationId) {
        await completeInvitation(organizationId);
        return;
      }
    } catch {
      // Proceed to accept call if listing fails
    }

    if (invitation.error && status !== "accepted") {
      // Check fallback if user was already added
      try {
        const orgsResult = await authClient.organization.list();
        const userOrgs = orgsResult.data ?? [];
        if (userOrgs.length > 0) {
          await completeInvitation(userOrgs[0].id);
          return;
        }
      } catch {
        // Fall through
      }

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
      // Check if accepting failed because user is already a member of an org
      try {
        const orgsResult = await authClient.organization.list();
        const userOrgs = orgsResult.data ?? [];
        const targetOrg = organizationId
          ? userOrgs.find((o) => o.id === organizationId)
          : userOrgs[0];

        if (targetOrg) {
          await completeInvitation(targetOrg.id);
          return;
        }
      } catch {
        // Fall through
      }

      setError(result.error.message ?? "Unable to accept invitation.");
      setAccepting(false);
      return;
    }

    await completeInvitation(organizationId);
  }

  const emailMismatch =
    Boolean(session?.user && invitedEmail) &&
    session?.user?.email?.toLowerCase() !== invitedEmail.toLowerCase();

  useEffect(() => {
    if (isPending || !session?.user || autoAcceptStarted.current || emailMismatch) {
      return;
    }

    autoAcceptStarted.current = true;
    setAccepting(true);
    void acceptInvitation();
  }, [isPending, session?.user, invitedEmail, invitationId, emailMismatch]);

  if (isPending || accepting) {
    return (
      <AuthLayout>
        <Card>
          <div className="invitation-accept__loading">
            <InlineStack align="center" blockAlign="center" gap="200">
              <Spinner size="small" />
              <Text as="p" tone="subdued">
                {session?.user ? "Joining organization…" : "Checking invitation…"}
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

          {emailMismatch ? (
            <Banner tone="warning" title="Signed in with a different email">
              <p>
                This invitation was sent to <strong>{invitedEmail}</strong>. Sign
                out and sign in with that email to continue.
              </p>
            </Banner>
          ) : null}

          {error ? (
            <Banner tone="critical" title="Invitation could not be accepted">
              <p>{error}</p>
            </Banner>
          ) : null}

          {session?.user && !emailMismatch ? (
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
