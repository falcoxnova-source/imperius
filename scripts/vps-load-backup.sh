#!/bin/bash
set -e
echo "=== Creating realtime schema ==="
docker exec xnova-database psql -U postgres -d postgres -c 'CREATE SCHEMA IF NOT EXISTS realtime'
echo "=== Creating realtime subscription_id_seq ==="
docker exec xnova-database psql -U postgres -d postgres -c 'CREATE SEQUENCE IF NOT EXISTS realtime.subscription_id_seq START 1'
echo "=== Loading backup (errors ignored) ==="
docker exec -i xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=off < /root/xnova/cloud_data_only.sql 2>&1 | tail -10
echo "=== Reload complete ==="
