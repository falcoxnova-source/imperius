#!/bin/sh
echo "=== Fix nginx realtime endpoint ==="
# Backup current config
cp /root/xnova/nginx/default-local.conf /root/xnova/nginx/default-local.conf.bak3

# Check current realtime config
echo "Current realtime config:"
grep -A 4 "realtime/v1" /root/xnova/nginx/default-local.conf

# Update realtime location to return 204 No Content (no body, no WebSocket)
sed -i 's|location /realtime/v1/ {|location /realtime/v1/ {\n        # Realtime not available - return 204 No Content\n        return 204;|' /root/xnova/nginx/default-local.conf
# Remove old return line
sed -i '/realtime\/v1/,+3 { /return 200/d }' /root/xnova/nginx/default-local.conf

echo ""
echo "After fix:"
grep -A 5 "realtime/v1" /root/xnova/nginx/default-local.conf

echo ""
echo "=== Reload nginx ==="
docker exec xnova-kong nginx -s reload 2>&1
echo "Nginx reloaded"

echo ""
echo "=== Test realtime endpoint ==="
curl -sk -o /dev/null -w "HTTP %{http_code}" 'https://127.0.0.1/realtime/v1/websocket' 2>&1
echo ""
