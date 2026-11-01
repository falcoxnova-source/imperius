#!/bin/bash
echo "=== frontend container ==="
docker ps --filter name=xnova-frontend --format '{{.Names}}\t{{.Status}}\t{{.Image}}'
echo
echo "=== where nginx serves & sw.js location inside container ==="
docker exec xnova-frontend sh -c 'ls -la /usr/share/nginx/html/sw.js 2>/dev/null; grep -n "CACHE_VERSION" /usr/share/nginx/html/sw.js 2>/dev/null | head -1'
echo
echo "=== VPS source tree (public/sw.js present? Dockerfile?) ==="
ls -la /root/xnova/public/sw.js 2>/dev/null && grep -n "CACHE_VERSION" /root/xnova/public/sw.js | head -1
ls -la /root/xnova/Dockerfile 2>/dev/null
echo
echo "=== how frontend is built (compose frontend service) ==="
sed -n '/frontend:/,/networks:/p' /root/xnova/docker-compose.yml | head -30
