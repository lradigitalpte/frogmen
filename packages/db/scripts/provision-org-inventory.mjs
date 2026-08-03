import postgres from "postgres";

const sql = postgres(
  process.env.DATABASE_URL ?? "postgresql://frog:frog@localhost:5432/frog1",
  { max: 1 },
);

const categories = [
  "Sonar & imaging",
  "USBL & positioning",
  "ROV accessories",
  "Cameras & sensors",
  "Packages & kits",
  "Spare parts",
];

const tags = [
  "CHASING M2 S/M2 PRO/M2 PRO MAX/ MINIS ACCESSORIES",
  "Blueprint",
  "Cerulean",
  "Chasing",
  "Sonar",
  "USBL",
  "DVL",
  "Packages",
];

const policies = [
  [
    "12-month manufacturer warranty",
    "Standard manufacturer warranty for ROVs, high-pressure hose systems, and diving regulators.",
    12,
  ],
  [
    "24-month extended warranty",
    "Extended coverage for premium equipment and bundled kits.",
    24,
  ],
  [
    "90-day parts warranty",
    "Short-term coverage for spare parts and consumables.",
    3,
  ],
];

try {
  const orgs = await sql`select id from organizations`;

  for (const org of orgs) {
    for (const name of categories) {
      await sql`
        insert into product_category_catalog (organization_id, name)
        select ${org.id}, ${name}
        where not exists (
          select 1 from product_category_catalog
          where organization_id = ${org.id}
            and deleted_at is null
            and lower(name) = lower(${name})
        )
      `;
    }

    for (const name of tags) {
      await sql`
        insert into product_tag_catalog (organization_id, name)
        select ${org.id}, ${name}
        where not exists (
          select 1 from product_tag_catalog
          where organization_id = ${org.id}
            and deleted_at is null
            and lower(name) = lower(${name})
        )
      `;
    }

    for (const [name, description, durationMonths] of policies) {
      await sql`
        insert into warranty_policies (
          organization_id,
          name,
          description,
          duration_months,
          is_active
        )
        select ${org.id}, ${name}, ${description}, ${durationMonths}, true
        where not exists (
          select 1 from warranty_policies
          where organization_id = ${org.id}
            and lower(name) = lower(${name})
        )
      `;
    }

    console.log(`Provisioned defaults for org ${org.id}`);
  }
} finally {
  await sql.end();
}
