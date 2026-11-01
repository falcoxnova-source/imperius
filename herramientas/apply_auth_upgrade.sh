#!/bin/bash
set -e
cd /root/xnova
TS=$(date +%Y%m%d_%H%M%S)

echo "=== 1. Backup compose ==="
cp docker-compose.yml docker-compose.yml.bak_$TS
echo "Backup -> /root/xnova/docker-compose.yml.bak_$TS"

echo "=== 2. Pre-pull new auth image (no downtime yet) ==="
docker pull supabase/auth:v2.190.0

echo "=== 3. Swap image tag (only the auth line) ==="
sed -i 's#image: supabase/gotrue:v2.151.0#image: supabase/auth:v2.190.0#' docker-compose.yml
echo "--- verify change ---"
grep -n 'container_name: xnova-auth' docker-compose.yml
grep -n 'supabase/auth:v2.190.0\|supabase/gotrue' docker-compose.yml

echo "=== 4. Recreate ONLY auth container ==="
docker compose up -d auth

echo "=== 5. Wait for health ==="
sleep 8
docker ps --filter name=xnova-auth --format '{{.Names}}\t{{.Status}}'

echo "=== 6. Recent auth logs (migrations + boot) ==="
docker logs --tail 40 xnova-auth 2>&1
