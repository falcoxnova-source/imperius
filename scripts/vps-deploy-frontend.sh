#!/bin/bash
set -e

echo "=== Extracting frontend from image ==="
mkdir -p /root/xnova/frontend-html
docker run --rm -v /root/xnova/frontend-html:/out xnova-frontend:latest sh -c "cp -r /usr/share/nginx/html/. /out/"

echo "=== Removing old kong ==="
docker rm -f xnova-kong 2>/dev/null || true

echo "=== Starting nginx proxy on port 80 ==="
docker run -d --name xnova-kong --network xnova-internal -p 80:80 \
  -v /root/xnova/frontend-html:/usr/share/nginx/html:ro \
  -v /root/xnova/nginx/default-local.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:alpine

sleep 3

echo "=== Testing ==="
curl -s -o /dev/null -w "Frontend: HTTP %{http_code}\n" http://localhost/
curl -s -o /dev/null -w "REST API: HTTP %{http_code}\n" http://localhost/rest/v1/
curl -s -o /dev/null -w "Auth:    HTTP %{http_code}\n" http://localhost/auth/v1/health

echo "=== Container status ==="
docker ps --format 'table {{.Names}}\t{{.Status}}'
