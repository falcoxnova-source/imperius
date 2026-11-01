#!/bin/bash
echo "=== Changing ownership of auth tables ==="
docker exec xnova-database psql -U postgres -d postgres <<'EOF'
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'auth'
  LOOP
    EXECUTE 'ALTER TABLE auth.' || r.tablename || ' OWNER TO supabase_auth_admin';
    RAISE NOTICE 'Changed owner of auth.%', r.tablename;
  END LOOP;
END $$;
EOF

echo "=== Restart auth ==="
docker restart xnova-auth
sleep 10
docker logs xnova-auth --tail 3
docker ps --filter name=xnova-auth --format '{{.Status}}'
