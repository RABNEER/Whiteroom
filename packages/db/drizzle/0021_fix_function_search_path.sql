DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace WHERE pg_namespace.nspname = 'pgboss' AND pg_proc.proname = 'create_queue') THEN
    ALTER FUNCTION pgboss.create_queue(text, json) SET search_path = pgboss, pg_catalog;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace WHERE pg_namespace.nspname = 'pgboss' AND pg_proc.proname = 'delete_queue') THEN
    ALTER FUNCTION pgboss.delete_queue(text) SET search_path = pgboss, pg_catalog;
  END IF;
END $$;
