CREATE OR REPLACE FUNCTION create_organization_main_branch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "branches" (
    "organization_id", "name", "code", "document_prefix", "is_main"
  )
  VALUES (NEW."id", 'Main Branch', 'MAIN', 'MAIN', true)
  ON CONFLICT ("organization_id", "code") DO NOTHING;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS "organizations_create_main_branch" ON "organizations";
CREATE TRIGGER "organizations_create_main_branch"
AFTER INSERT ON "organizations"
FOR EACH ROW EXECUTE FUNCTION create_organization_main_branch();

INSERT INTO "branches" (
  "organization_id", "name", "code", "document_prefix", "is_main"
)
SELECT o."id", 'Main Branch', 'MAIN', 'MAIN', true
FROM "organizations" o
WHERE NOT EXISTS (
  SELECT 1 FROM "branches" b WHERE b."organization_id" = o."id"
)
ON CONFLICT ("organization_id", "code") DO NOTHING;
