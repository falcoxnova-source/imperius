#!/bin/sh
echo "=== Fix nginx: use Docker host IP 172.18.0.1 ==="
cp /root/xnova/nginx/default-local.conf /root/xnova/nginx/default-local.conf.bak6

python3 << 'PYEOF'
with open('/root/xnova/nginx/default-local.conf', 'r') as f:
    content = f.read()

# Fix the realtime location - use host IP instead of 127.0.0.1
old = '''    # Realtime WebSocket - proxy to blackhole server (keeps client happy)
    location /realtime/v1/ {
        access_log off;
        proxy_pass http://127.0.0.1:9090;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }'''

new = '''    # Realtime WebSocket - proxy to blackhole server (keeps client happy)
    location /realtime/v1/ {
        access_log off;
        proxy_pass http://172.18.0.1:9090;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }'''

content = content.replace(old, new)
with open('/root/xnova/nginx/default-local.conf', 'w') as f:
    f.write(content)
print('Updated proxy_pass to 172.18.0.1:9090')
PYEOF

echo ""
echo "=== Verify config ==="
grep -A 10 'realtime/v1' /root/xnova/nginx/default-local.conf

echo ""
echo "=== Test nginx config ==="
docker exec xnova-kong nginx -t 2>&1

echo ""
echo "=== Reload nginx ==="
docker exec xnova-kong nginx -s reload 2>&1

echo ""
echo "=== Test WS endpoint via nginx (curl can't do WS, but check nginx log) ==="
sleep 1
curl -sk -o /dev/null -w "HTTP %{http_code}\n" -H 'Upgrade: websocket' -H 'Connection: Upgrade' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Sec-WebSocket-Version: 13' 'https://127.0.0.1/realtime/v1/websocket' 2>&1

echo ""
echo "=== Check nginx error log (should show 101 or no errors) ==="
docker logs xnova-kong --tail 5 2>&1

echo ""
echo "=== Verify Python server has active connection ==="
ss -tnp | grep 9090
