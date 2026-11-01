#!/bin/bash
echo "=== DNS: where does tung.xnova.xyz point? (this VPS is 76.13.98.28) ==="
getent hosts tung.xnova.xyz || nslookup tung.xnova.xyz 2>/dev/null | tail -5

echo
echo "=== What does this VPS serve for the app root (via kong on 443)? ==="
curl -sk -I https://localhost/ 2>&1 | head -15
echo "--- sw.js served here? ---"
curl -sk -I https://localhost/sw.js 2>&1 | head -10
echo "--- first line of served sw.js ---"
curl -sk https://localhost/sw.js 2>&1 | head -1

echo
echo "=== Kong declarative config: any static/frontend route? ==="
docker exec xnova-kong sh -c 'cat /home/kong/kong.yml 2>/dev/null || cat /usr/local/kong/declarative/kong.yml 2>/dev/null || find / -name kong.yml 2>/dev/null | head' 2>&1 | grep -iE 'host|path|service|url|name:' | head -40
