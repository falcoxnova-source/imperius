#!/bin/bash
set -e

echo "=== Adding trust rule for supabase_auth_admin on Docker network ==="
docker exec xnova-database bash -c 'echo "host  all  supabase_auth_admin  172.16.0.0/12  trust" >> /etc/postgresql/pg_hba.conf'

echo "=== Reload PostgreSQL config ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT pg_reload_conf();"

echo "=== Test connection from auth container ==="
docker exec xnova-database psql -h database -U supabase_auth_admin -d postgres -c "SELECT 'TRUST_OK' as conn;" 2>&1 || echo "Testing via alter container..."
docker exec xnova-auth psql -h database -U supabase_auth_admin -d postgres -c "SELECT 'TRUST_OK' as conn;" 2>&1 || echo "(auth container restarting, cant test directly)"

echo "=== Restart auth ==="
docker restart xnova-auth
sleep 8
echo "=== Auth logs ==="
docker logs xnova-auth --tail 5
echo "=== Container status ==="
docker ps --filter name=xnova
