#!/bin/bash
echo "=== Changing id to text ==="
docker exec xnova-database psql -U postgres -d postgres -c "ALTER TABLE auth.identities ALTER COLUMN id TYPE text;"
echo "=== Restart auth ==="
docker restart xnova-auth
sleep 10
docker logs xnova-auth --tail 5
docker ps --filter name=xnova-auth --format '{{.Status}}'
