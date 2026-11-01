#!/bin/bash
echo "=== Health ==="
docker exec xnova-auth wget -q -O - http://localhost:9999/health; echo

echo "=== Direct token endpoint test (invalid refresh -> must be 4xx, NOT 500) ==="
docker exec xnova-auth wget -q -O - --post-data='{"refresh_token":"invalid-test-token"}' \
  --header='Content-Type: application/json' \
  --header='apikey: test' \
  "http://localhost:9999/token?grant_type=refresh_token" 2>&1
echo
echo "--- http status via server-status check ---"
docker exec xnova-auth sh -c 'wget -S -q -O /dev/null --post-data="{\"refresh_token\":\"invalid\"}" --header="Content-Type: application/json" "http://localhost:9999/token?grant_type=refresh_token" 2>&1 | grep HTTP'

echo
echo "=== Recent /token results from real clients (last 30 log lines) ==="
docker logs --tail 30 xnova-auth 2>&1 | grep -E '"path":"/token"|status' || echo "(no recent /token requests yet)"
