DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'frog1_runtime') THEN
    RAISE EXCEPTION 'frog1_runtime must be provisioned by a database administrator before migrations run';
  END IF;

  IF NOT pg_has_role(CURRENT_USER, 'frog1_runtime', 'member') THEN
    RAISE EXCEPTION 'frog1_runtime must be granted to % before migrations run', CURRENT_USER;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO frog1_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public TO frog1_runtime;
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public TO frog1_runtime;
GRANT EXECUTE
  ON ALL FUNCTIONS IN SCHEMA public TO frog1_runtime;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO frog1_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO frog1_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO frog1_runtime;
