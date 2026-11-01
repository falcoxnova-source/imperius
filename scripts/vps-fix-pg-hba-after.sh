#!/bin/bash
set -e
echo "=== Stopping auth ==="
docker stop xnova-auth 2>/dev/null || true

echo "=== Fixing pg_hba.conf AFTER container start ==="
# The supabase/postgres image overwrites pg_hba.conf on start
# We fix it after the DB is up and BEFORE auth starts
docker exec xnova-database bash -c "echo 'host all all 0.0.0.0/0 trust' >> /var/lib/postgresql/data/pg_hba.conf"
docker exec xnova-database psql -U postgres -d postgres -c "SELECT pg_reload_conf();"

echo "=== Testing connection ==="
docker exec xnova-database psql -h database -U supabase_auth_admin -d postgres -c "SELECT 'OK' as conn;" 2>&1

echo "=== Starting auth ==="
docker start xnova-auth
sleep 10
echo "=== Auth logs ==="
docker logs xnova-auth --tail 5
echo "=== Status ==="
docker ps --filter name=xnova
