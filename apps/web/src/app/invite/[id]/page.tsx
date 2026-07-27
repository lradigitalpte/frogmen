import { InvitationAcceptPage } from "@/components/auth/invitation-accept-page";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  return (
    <InvitationAcceptPage
      invitationId={id}
      invitedEmail={query.email}
    />
  );
}
