-- Fix avatar/storage upload: grant the standard Supabase storage privileges
-- to the roles that the storage service switches into (service_role, authenticated).
-- Without USAGE on schema storage, storage.buckets/objects become invisible and
-- the service fails with: relation "buckets" does not exist.

GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
