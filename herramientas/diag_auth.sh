#!/bin/bash
echo "=== Containers ==="
docker ps --format '{{.Names}}\t{{.Status}}' | grep -iE 'auth|gotrue|kong|rest|postgres' || docker ps --format '{{.Names}}\t{{.Status}}'

AUTH=$(docker ps --format '{{.Names}}' | grep -iE 'auth|gotrue' | head -1)
echo
echo "=== AUTH container: $AUTH ==="
echo "--- last 60 log lines ---"
docker logs --tail 60 "$AUTH" 2>&1
