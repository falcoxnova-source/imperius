#!/bin/sh
echo "=== List all JS files ==="
docker exec xnova-kong ls /usr/share/nginx/html/assets/ 2>&1

echo ""
echo "=== Find useIsUserPlus ==="
docker exec xnova-kong find /usr/share/nginx/html/assets/ -name '*useIs*' -o -name '*IsUser*' 2>&1
