#!/bin/bash
echo "=== xnova-kong image + mounts ==="
docker inspect xnova-kong --format 'image={{.Config.Image}}'
docker inspect xnova-kong --format '{{range .Mounts}}{{.Source}} -> {{.Destination}} ({{.Type}}){{println}}{{end}}'
echo
echo "=== nginx docroot inside the container serving 80/443 ==="
docker exec xnova-kong sh -c 'nginx -T 2>/dev/null | grep -E "root |server_name |listen " | head -40'
echo
echo "=== locate sw.js inside container ==="
docker exec xnova-kong sh -c 'find / -name sw.js 2>/dev/null | grep -v proc | head; echo "---"; ls -la /usr/share/nginx/html/sw.js 2>/dev/null; head -1 /usr/share/nginx/html/sw.js 2>/dev/null'
