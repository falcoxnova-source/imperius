#!/bin/bash
echo "=== Stop auth ==="
docker stop xnova-auth 2>/dev/null

echo "=== Fix ALL auth objects ownership ==="
docker exec xnova-database psql -U postgres -d postgres <<'EOF'
-- Tables
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'auth'
  LOOP
    EXECUTE 'ALTER TABLE auth.' || r.tablename || ' OWNER TO supabase_auth_admin';
  END LOOP;
END $$;

-- Functions
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'auth'
  LOOP
    EXECUTE 'ALTER FUNCTION auth.' || r.proname || ' OWNER TO supabase_auth_admin';
  END LOOP;
END $$;

-- Sequences
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'auth'
  LOOP
    EXECUTE 'ALTER SEQUENCE auth.' || r.sequencename || ' OWNER TO supabase_auth_admin';
  END LOOP;
END $$;

-- Views
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT viewname FROM pg_views WHERE schemaname = 'auth'
  LOOP
    EXECUTE 'ALTER VIEW auth.' || r.viewname || ' OWNER TO supabase_auth_admin';
  END LOOP;
END $$;

-- Grant schema
GRANT ALL PRIVILEGES ON SCHEMA auth TO supabase_auth_admin;
ALTER SCHEMA auth OWNER TO supabase_auth_admin;
EOF

echo "=== Start auth ==="
docker start xnova-auth
sleep 12
docker logs xnova-auth --tail 3
docker ps --filter name=xnova-auth --format '{{.Status}}'
