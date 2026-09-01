import postgres from "postgres";

const DEFAULT_PRESET_TEMPLATES = [
  {
    name: "Product & Feature Launch",
    category: "announcement",
    description: "Sleek hero announcement with highlight cards, feature breakdown, and primary call to action.",
    subject: "Introducing our newest capabilities for {{company}}",
    previewText: "Discover what's new and see how it streamlines your operations.",
    designConfig: {
      primaryColor: "#047857",
      backgroundColor: "#f4f7f5",
      darkBackgroundColor: "#0b1311",
      cardBackgroundColor: "#ffffff",
      darkCardBackgroundColor: "#13211c",
      textColor: "#334155",
      darkTextColor: "#e2e8f0",
      headingColor: "#0f172a",
      darkHeadingColor: "#ffffff",
      showLogo: true,
      brandName: "Frogmen Technologies",
      headerStyle: "banner",
      ctaLabel: "Explore New Features",
      ctaUrl: "https://frogmen.app/dashboard",
      ctaStyle: "rounded",
      footerText: "You are receiving this update as a valued partner of Frogmen Technologies.",
      companyAddress: "Frogmen Technologies Pte Ltd",
      showUnsubscribe: true,
    },
    bodyHtml: `<p>Hello {{first_name}},</p><p>We are thrilled to announce a major update designed to enhance your workflow and drive greater efficiency across {{company}}.</p><div class="feature-card"><div class="badge">NEW CAPABILITY</div><h3 style="margin-top:0;">Real-Time Operational Intelligence</h3><p style="margin-bottom:0;">Automate data synchronization, streamline quotation approvals, and track end-to-end deliverables with instant visibility.</p></div><div class="feature-card"><div class="badge">INTEGRATION</div><h3 style="margin-top:0;">Unified Communication Hub</h3><p style="margin-bottom:0;">Keep every team member and stakeholder aligned with integrated activity logs and automated delivery notifications.</p></div><p>We've already enabled these improvements on your account. Click below to experience the latest version or reply directly to this email with any questions.</p>`,
  },
  {
    name: "Exclusive Partner Offer",
    category: "promotion",
    description: "High-impact promotional campaign with highlight badge, value proposition, and time-sensitive CTA.",
    subject: "Exclusive offer for {{company}} — limited time pricing",
    previewText: "Unlock specialized service rates this month.",
    designConfig: {
      primaryColor: "#0f766e",
      backgroundColor: "#f0fdfa",
      darkBackgroundColor: "#041e1c",
      cardBackgroundColor: "#ffffff",
      darkCardBackgroundColor: "#0d2b27",
      textColor: "#334155",
      darkTextColor: "#e2e8f0",
      headingColor: "#0f172a",
      darkHeadingColor: "#ffffff",
      showLogo: true,
      brandName: "Frogmen Technologies",
      headerStyle: "banner",
      ctaLabel: "Claim Your Special Rate",
      ctaUrl: "https://frogmen.app/dashboard/sales/quotations",
      ctaStyle: "rounded",
      footerText: "Offer valid for registered accounts. Terms and conditions apply.",
      companyAddress: "Frogmen Technologies Pte Ltd",
      showUnsubscribe: true,
    },
    bodyHtml: `<p>Hi {{first_name}},</p><p>As part of our commitment to supporting {{company}}'s upcoming projects, we are extending special commercial pricing for services confirmed this quarter.</p><div style="background:linear-gradient(135deg, #0f766e, #14b8a6);border-radius:12px;padding:24px;color:#ffffff;text-align:center;margin:24px 0;"><div style="font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;opacity:0.9;">SPECIAL INCENTIVE</div><div style="font-size:32px;font-weight:800;margin:8px 0;">15% Preferential Credit</div><div style="font-size:14px;opacity:0.9;">On all ROV inspection packages and service contracts requested before the end of the month.</div></div><p>Whether you have scheduled maintenance or new deployments coming up, our engineering team is ready to assist with dedicated priority scheduling.</p>`,
  },
  {
    name: "Industry Insights & Digest",
    category: "newsletter",
    description: "Clean editorial layout for monthly updates, industry analysis, and curated case studies.",
    subject: "Frogmen Monthly Dispatch: Insights & Updates for {{company}}",
    previewText: "Latest subsea inspection innovations and operational benchmarks.",
    designConfig: {
      primaryColor: "#0284c7",
      backgroundColor: "#f8fafc",
      darkBackgroundColor: "#0b1320",
      cardBackgroundColor: "#ffffff",
      darkCardBackgroundColor: "#131d2e",
      textColor: "#334155",
      darkTextColor: "#e2e8f0",
      headingColor: "#0f172a",
      darkHeadingColor: "#ffffff",
      showLogo: true,
      brandName: "Frogmen Technologies",
      headerStyle: "centered",
      ctaLabel: "Read the Full Report",
      ctaUrl: "https://frogmen.app",
      ctaStyle: "rounded",
      footerText: "You are receiving our monthly technical newsletter.",
      companyAddress: "Frogmen Technologies Pte Ltd",
      showUnsubscribe: true,
    },
    bodyHtml: `<p>Dear {{name}},</p><p>Welcome to this month's edition of the Frogmen Technical Digest. Here is a summary of the key developments and engineering highlights from our team.</p><h2 style="border-bottom:2px solid #0284c7;padding-bottom:6px;margin-top:24px;">1. Advanced ROV Telemetry</h2><p>Our latest offshore deployments demonstrated a 40% reduction in inspection turnaround times through AI-assisted defect tagging and automated reporting.</p><h2 style="border-bottom:2px solid #0284c7;padding-bottom:6px;margin-top:24px;">2. Regulatory Standards Update</h2><p>New compliance guidelines for marine asset integrity inspections take effect next quarter. Check out our checklist to ensure all documentation is fully up to date.</p><p>Thank you for partnering with us as we continue innovating subsea technology and asset safety.</p>`,
  },
  {
    name: "Customer Onboarding & Welcome",
    category: "onboarding",
    description: "Warm introductory welcome with clear next steps and direct contact channels.",
    subject: "Welcome to Frogmen Technologies, {{first_name}}!",
    previewText: "Everything you need to get started with your account.",
    designConfig: {
      primaryColor: "#047857",
      backgroundColor: "#f4f7f5",
      darkBackgroundColor: "#0b1311",
      cardBackgroundColor: "#ffffff",
      darkCardBackgroundColor: "#13211c",
      textColor: "#334155",
      darkTextColor: "#e2e8f0",
      headingColor: "#0f172a",
      darkHeadingColor: "#ffffff",
      showLogo: true,
      brandName: "Frogmen Technologies",
      headerStyle: "banner",
      ctaLabel: "Access Your Dashboard",
      ctaUrl: "https://frogmen.app/dashboard",
      ctaStyle: "rounded",
      footerText: "We are glad to have {{company}} as our partner.",
      companyAddress: "Frogmen Technologies Pte Ltd",
      showUnsubscribe: true,
    },
    bodyHtml: `<p>Hello {{first_name}},</p><p>Welcome to Frogmen Technologies! We are thrilled to partner with {{company}} and look forward to collaborating on your upcoming operations.</p><h3>Getting Started in 3 Easy Steps:</h3><ol><li><strong>Access your client portal:</strong> View active quotes, asset inspection reports, and project status in real-time.</li><li><strong>Review your team profile:</strong> Add authorized contacts and specify technical notification preferences.</li><li><strong>Connect with your dedicated rep:</strong> Reach out whenever you need custom quotations or rapid deployment assistance.</li></ol><p>If you have any questions or require custom specifications, please do not hesitate to reach out directly.</p>`,
  },
  {
    name: "B2B Outreach & Follow-up",
    category: "outreach",
    description: "Direct, high-converting letterhead design for lead nurture and consultative follow-ups.",
    subject: "Quick question regarding {{company}}'s inspection projects",
    previewText: "Exploring subsea and marine asset maintenance efficiencies.",
    designConfig: {
      primaryColor: "#0f172a",
      backgroundColor: "#f8fafc",
      darkBackgroundColor: "#090d16",
      cardBackgroundColor: "#ffffff",
      darkCardBackgroundColor: "#111827",
      textColor: "#334155",
      darkTextColor: "#e2e8f0",
      headingColor: "#0f172a",
      darkHeadingColor: "#ffffff",
      showLogo: true,
      brandName: "Frogmen Technologies",
      headerStyle: "minimal",
      ctaLabel: "Schedule a 10-min Call",
      ctaUrl: "https://calendly.com",
      ctaStyle: "outline",
      footerText: "Sent by the Frogmen Commercial Team.",
      companyAddress: "Frogmen Technologies Pte Ltd",
      showUnsubscribe: true,
    },
    bodyHtml: `<p>Hi {{first_name}},</p><p>I noticed {{company}} has active operations in marine engineering and subsea infrastructure, and wanted to reach out briefly.</p><p>Our team specializes in high-precision ROV asset inspection, structural integrity assessments, and automated defect reporting that saves project managers 20+ hours per inspection cycle.</p><p>Do you have 10 minutes next week to explore if there is a mutual fit for your upcoming quarter?</p><p>Best regards,<br /><strong>Commercial Team</strong><br />Frogmen Technologies</p>`,
  },
  {
    name: "Minimal Direct Letter",
    category: "custom",
    description: "Distraction-free personal letter style with clean formatting and elegant footer.",
    subject: "Update from Frogmen Technologies for {{company}}",
    previewText: "An important message from our executive team.",
    designConfig: {
      primaryColor: "#047857",
      backgroundColor: "#f8fafc",
      darkBackgroundColor: "#0b1311",
      cardBackgroundColor: "#ffffff",
      darkCardBackgroundColor: "#13211c",
      textColor: "#1e293b",
      darkTextColor: "#f1f5f9",
      headingColor: "#0f172a",
      darkHeadingColor: "#ffffff",
      showLogo: false,
      brandName: "Frogmen Technologies",
      headerStyle: "minimal",
      ctaLabel: "View Details",
      ctaUrl: "https://frogmen.app",
      ctaStyle: "rounded",
      footerText: "Frogmen Technologies — Confidential & Direct.",
      companyAddress: "Frogmen Technologies Pte Ltd",
      showUnsubscribe: true,
    },
    bodyHtml: `<p>Dear {{name}},</p><p>I am writing to share an important update regarding our collaboration with {{company}}.</p><p>Please review the details attached or through your account portal, and let us know how we can best support your operational milestones.</p><p>Warm regards,<br /><strong>Operations Director</strong><br />Frogmen Technologies</p>`,
  },
];

export async function applyEmailMarketingIfNeeded(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });

  try {
    // Check if email_templates table exists
    const [{ templatesExists }] = await sql<{ templatesExists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'email_templates'
      ) AS "templatesExists"
    `;

    if (!templatesExists) {
      console.log("[db] Applying email marketing migration...");

      // Create ENUM types safely if they don't exist
      await sql`
        DO $$ BEGIN
          CREATE TYPE email_template_category AS ENUM (
            'announcement', 'promotion', 'newsletter', 'onboarding', 'outreach', 'custom'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `;

      await sql`
        DO $$ BEGIN
          CREATE TYPE email_campaign_status AS ENUM (
            'draft', 'scheduled', 'sending', 'sent', 'partially_sent', 'failed', 'cancelled'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `;

      await sql`
        DO $$ BEGIN
          CREATE TYPE email_audience_type AS ENUM (
            'all', 'contacts', 'leads', 'segment', 'custom'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `;

      await sql`
        DO $$ BEGIN
          CREATE TYPE recipient_delivery_status AS ENUM (
            'pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `;

      // 1. email_templates table
      await sql`
        CREATE TABLE email_templates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          category email_template_category NOT NULL DEFAULT 'custom',
          subject VARCHAR(255) NOT NULL,
          preview_text VARCHAR(255),
          body_html TEXT NOT NULL,
          body_text TEXT,
          design_config JSONB,
          is_system_preset BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          deleted_at TIMESTAMPTZ
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS email_templates_org_idx ON email_templates(organization_id);
      `;

      // 2. email_campaigns table
      await sql`
        CREATE TABLE email_campaigns (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          subject VARCHAR(255) NOT NULL,
          preview_text VARCHAR(255),
          from_name VARCHAR(150),
          from_email VARCHAR(255),
          reply_to VARCHAR(255),
          template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
          body_html TEXT NOT NULL,
          body_text TEXT,
          design_config JSONB,
          target_audience_type email_audience_type NOT NULL DEFAULT 'all',
          audience_filter JSONB,
          status email_campaign_status NOT NULL DEFAULT 'draft',
          scheduled_at TIMESTAMPTZ,
          sent_at TIMESTAMPTZ,
          total_recipients INTEGER NOT NULL DEFAULT 0,
          sent_count INTEGER NOT NULL DEFAULT 0,
          delivered_count INTEGER NOT NULL DEFAULT 0,
          opened_count INTEGER NOT NULL DEFAULT 0,
          clicked_count INTEGER NOT NULL DEFAULT 0,
          bounced_count INTEGER NOT NULL DEFAULT 0,
          unsubscribed_count INTEGER NOT NULL DEFAULT 0,
          created_by_user_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          deleted_at TIMESTAMPTZ
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS email_campaigns_org_idx ON email_campaigns(organization_id);
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS email_campaigns_status_idx ON email_campaigns(organization_id, status);
      `;

      // 3. email_campaign_recipients table
      await sql`
        CREATE TABLE email_campaign_recipients (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          recipient_type VARCHAR(50) NOT NULL DEFAULT 'contact',
          contact_id UUID REFERENCES customers(id) ON DELETE SET NULL,
          lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
          email VARCHAR(255) NOT NULL,
          name VARCHAR(255),
          company VARCHAR(255),
          status recipient_delivery_status NOT NULL DEFAULT 'pending',
          resend_email_id VARCHAR(100),
          sent_at TIMESTAMPTZ,
          delivered_at TIMESTAMPTZ,
          opened_at TIMESTAMPTZ,
          open_count INTEGER NOT NULL DEFAULT 0,
          clicked_at TIMESTAMPTZ,
          click_count INTEGER NOT NULL DEFAULT 0,
          last_clicked_url TEXT,
          bounced_at TIMESTAMPTZ,
          error_message TEXT,
          tracking_token VARCHAR(100) UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS email_recipients_camp_idx ON email_campaign_recipients(campaign_id);
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS email_recipients_token_idx ON email_campaign_recipients(tracking_token);
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS email_recipients_resend_idx ON email_campaign_recipients(resend_email_id);
      `;

      // 4. email_marketing_unsubscribes table
      await sql`
        CREATE TABLE email_marketing_unsubscribes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          email VARCHAR(255) NOT NULL,
          reason TEXT,
          campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS email_unsub_org_email_idx ON email_marketing_unsubscribes(organization_id, email);
      `;

      console.log("[db] Email marketing tables created.");
    }

    // Seed preset templates for existing organizations if not already present
    const orgs = await sql<{ id: string }[]>`SELECT id FROM organizations`;
    for (const org of orgs) {
      const [{ count }] = await sql<{ count: string }[]>`
        SELECT count(*)::text as count FROM email_templates 
        WHERE organization_id = ${org.id} AND is_system_preset = true
      `;

      if (Number(count) === 0) {
        for (const preset of DEFAULT_PRESET_TEMPLATES) {
          await sql`
            INSERT INTO email_templates (
              organization_id, name, description, category, subject, preview_text,
              body_html, design_config, is_system_preset
            ) VALUES (
              ${org.id}, ${preset.name}, ${preset.description}, ${preset.category},
              ${preset.subject}, ${preset.previewText}, ${preset.bodyHtml},
              ${JSON.stringify(preset.designConfig)}, true
            )
          `;
        }
      }
    }
  } finally {
    await sql.end();
  }
}
