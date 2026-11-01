#!/bin/sh
# Backup
cp /root/xnova/nginx/default-local.conf /root/xnova/nginx/default-local.conf.bak3

# Replace the realtime block (lines 100-105) with proper WebSocket handling
# Use python for reliable replacement
python3 -c "
import re
with open('/root/xnova/nginx/default-local.conf', 'r') as f:
    content = f.read()

old = '''    # Realtime WebSocket (not available locally - return HTTP 200 so client fails cleanly)
    location /realtime/v1/ {
        access_log off;
        return 200 '{}';
        add_header Content-Type application/json;
    }'''

new = '''    # Realtime WebSocket - not available, return clean 204
    location /realtime/v1/ {
        access_log off;
        return 204;
    }'''

content = content.replace(old, new)
with open('/root/xnova/nginx/default-local.conf', 'w') as f:
    f.write(content)
print('Done')
"

echo "=== Verify ==="
grep -A 5 "realtime/v1" /root/xnova/nginx/default-local.conf

echo ""
echo "=== Test nginx config ==="
docker exec xnova-kong nginx -t 2>&1

echo ""
echo "=== Reload nginx ==="
docker exec xnova-kong nginx -s reload 2>&1
echo "Reloaded"

echo ""
echo "=== Quick test ==="
curl -sk -o /dev/null -w "%{http_code}" 'https://127.0.0.1/realtime/v1/websocket'
echo ""
