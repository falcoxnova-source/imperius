#!/bin/bash
echo "=== Disabling GoTrue migrations ==="
# Rename the migration file so GoTrue skips it
docker exec xnova-auth sh -c 'cd /usr/local/etc/auth/migrations && mv 20221208132122_backfill_email_last_sign_in_at.up.sql 20221208132122_backfill_email_last_sign_in_at.up.sql.skip 2>/dev/null || true'

echo "=== Restart auth ==="
docker restart xnova-auth
sleep 10
echo "=== Auth logs ==="
docker logs xnova-auth --tail 8
echo "=== Status ==="
docker ps --filter name=xnova-auth --format '{{.Status}}'
