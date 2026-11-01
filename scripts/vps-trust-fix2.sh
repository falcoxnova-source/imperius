#!/bin/bash
set -e

echo "=== Adding trust rule for supabase_auth_admin ==="
docker exec xnova-database bash -c 'echo "" >> /var/lib/postgresql/data/pg_hba.conf'
docker exec xnova-database bash -c 'echo "# Trust supabase_auth_admin from Docker network" >> /var/lib/postgresql/data/pg_hba.conf'
docker exec xnova-database bash -c 'echo "host  all  supabase_auth_admin  0.0.0.0/0  trust" >> /var/lib/postgresql/data/pg_hba.conf'

echo "=== Verify rule was added ==="
docker exec xnova-database tail -5 /var/lib/postgresql/data/pg_hba.conf

echo "=== Reload PostgreSQL ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT pg_reload_conf();"

echo "=== Test from database container to database host ==="
docker exec xnova-database psql -h database -U supabase_auth_admin -d postgres -c "SELECT 'TRUST_OK' as conn;"

echo "=== Restart auth ==="
docker restart xnova-auth
sleep 8
docker logs xnova-auth --tail 5
