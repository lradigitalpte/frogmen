"use client";

import Link from "next/link";
import { Badge, BlockStack, InlineStack, Spinner, Text } from "@shopify/polaris";
import { AppPage } from "@/components/layout/page";
import { useSession } from "@/lib/auth-client";
import { getMe, type SecurityContext } from "@/lib/security-api";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  KeyRound,
  Mail,
  MapPin,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const quickLinks = [
  {
    href: "/dashboard/profile/information",
    icon: UserRound,
    title: "Profile information",
    description: "Update your name and account identity.",
    tone: "blue",
  },
  {
    href: "/dashboard/profile/tasks",
    icon: ClipboardCheck,
    title: "Assigned tasks",
    description: "Review work assigned to your account.",
    tone: "green",
  },
  {
    href: "/dashboard/profile/security",
    icon: KeyRound,
    title: "Password & security",
    description: "Change your password and protect access.",
    tone: "violet",
  },
];

function roleLabel(role?: string) {
  if (!role) return "Member";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function ProfileOverviewPage() {
  const { data: session, isPending } = useSession();
  const [security, setSecurity] = useState<SecurityContext | null>(null);

  useEffect(() => {
    void getMe()
      .then((result) => setSecurity(result.security))
      .catch(() => setSecurity(null));
  }, []);

  const userName = session?.user?.name ?? "User";
  const userEmail = session?.user?.email ?? " ";
  const initials = useMemo(
    () =>
      userName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "U",
    [userName],
  );

  if (isPending) {
    return (
      <AppPage title="Profile overview">
        <InlineStack align="center"><Spinner /></InlineStack>
      </AppPage>
    );
  }

  return (
    <AppPage
      title="Profile overview"
      subtitle="Your account identity, access, assigned work, and security."
    >
      <BlockStack gap="500">
        <section className="profile-overview-hero">
          <div className="profile-overview-hero__identity">
            <div className="profile-overview-avatar">{initials}</div>
            <div>
              <span className="profile-overview-eyebrow">Signed in account</span>
              <h2>{userName}</h2>
              <p><Mail size={15} />{userEmail}</p>
              <InlineStack gap="200" wrap>
                <Badge tone="success">{roleLabel(security?.role)}</Badge>
                <Badge tone="info">
                  {security?.branchScope === "all" ? "All branches" : "Branch access"}
                </Badge>
              </InlineStack>
            </div>
          </div>
          <div className="profile-overview-hero__secure">
            <ShieldCheck size={24} />
            <div><strong>Account protected</strong><span>Authenticated organization session</span></div>
          </div>
        </section>

        <div className="profile-overview-stats">
          <div>
            <span className="profile-overview-stat-icon"><Building2 size={18} /></span>
            <p><small>Organization role</small><strong>{roleLabel(security?.role)}</strong></p>
          </div>
          <div>
            <span className="profile-overview-stat-icon green"><MapPin size={18} /></span>
            <p>
              <small>Available branches</small>
              <strong>{security?.canAccessAllBranches ? "All branches" : `${security?.branches.length ?? 0} assigned`}</strong>
            </p>
          </div>
          <div>
            <span className="profile-overview-stat-icon violet"><CheckCircle2 size={18} /></span>
            <p><small>Access status</small><strong>Active</strong></p>
          </div>
        </div>

        <section>
          <div className="profile-overview-section-heading">
            <div>
              <Text as="h2" variant="headingMd">Manage your account</Text>
              <Text as="p" tone="subdued">Quick access to your personal workspace and security controls.</Text>
            </div>
          </div>
          <div className="profile-overview-links">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link className="profile-overview-link" href={item.href} key={item.href}>
                  <span className={`profile-overview-link__icon ${item.tone}`}><Icon size={21} /></span>
                  <div><strong>{item.title}</strong><small>{item.description}</small></div>
                  <ArrowRight className="profile-overview-link__arrow" size={18} />
                </Link>
              );
            })}
          </div>
        </section>
      </BlockStack>
    </AppPage>
  );
}
