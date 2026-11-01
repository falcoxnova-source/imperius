#!/bin/bash
set -e

echo "=== Creating proper pg_hba.conf ==="
docker exec xnova-database bash -c 'cat > /tmp/pg_hba_new.conf << EOF
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
local   replication     all                                     trust
host    replication     all             127.0.0.1/32            trust
host    replication     all             ::1/128                 trust
host    all             all             0.0.0.0/0               trust
EOF
cp /tmp/pg_hba_new.conf /var/lib/postgresql/data/pg_hba.conf'

echo "=== Reload config ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT pg_reload_conf();"

echo "=== Test connection ==="
docker exec xnova-database psql -h database -U supabase_auth_admin -d postgres -c "SELECT 'TRUST_OK' as conn;"

echo "=== Restart auth ==="
docker restart xnova-auth
sleep 8
docker logs xnova-auth --tail 5
docker ps --filter name=xnova-auth --format '{{.Status}}'
