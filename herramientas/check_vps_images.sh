#!/bin/sh
echo "=== VPS Docker images ==="
docker images | grep xnova

echo ""
echo "=== VPS Docker ps ==="
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

echo ""
echo "=== Check nginx container frontend files date ==="
docker exec xnova-kong ls -la /usr/share/nginx/html/assets/MarketPage-*.js 2>&1

echo ""
echo "=== Check if local docker has different image ==="
docker images --format "{{.Repository}}:{{.Tag}} {{.ID}} {{.CreatedAt}}" | grep xnova 2>&1
