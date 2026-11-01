#!/bin/sh
echo "=== 1. Deploy WebSocket blackhole server ==="
cp /tmp/ws_server.py /root/xnova/ws_server.py
chmod +x /root/xnova/ws_server.py

echo "=== 2. Create systemd service ==="
cat > /etc/systemd/system/xnova-ws.service << 'EOF'
[Unit]
Description=Xnova WebSocket Blackhole Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 /root/xnova/ws_server.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "=== 3. Start service ==="
systemctl daemon-reload
systemctl enable xnova-ws
systemctl restart xnova-ws
sleep 1
systemctl status xnova-ws --no-pager

echo ""
echo "=== 4. Update nginx to proxy WebSocket ==="
cp /root/xnova/nginx/default-local.conf /root/xnova/nginx/default-local.conf.bak5

python3 << 'PYEOF'
with open('/root/xnova/nginx/default-local.conf', 'r') as f:
    content = f.read()

old = '''    # Realtime WebSocket - not available, reject cleanly with 426
    location /realtime/v1/ {
        access_log off;
        return 426 '{"error":"realtime not available"}';
        add_header Content-Type application/json;
    }'''

new = '''    # Realtime WebSocket - proxy to blackhole server (keeps client happy)
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

content = content.replace(old, new)
with open('/root/xnova/nginx/default-local.conf', 'w') as f:
    f.write(content)
print('Nginx config updated')
PYEOF

echo ""
echo "=== 5. Test nginx config ==="
docker exec xnova-kong nginx -t 2>&1

echo ""
echo "=== 6. Reload nginx ==="
docker exec xnova-kong nginx -s reload 2>&1

echo ""
echo "=== 7. Test WS endpoint ==="
sleep 2
# Test with curl - it won't do WebSocket, but should get a response
curl -sk -w "\nHTTP %{http_code}\n" 'https://127.0.0.1/realtime/v1/websocket' 2>&1 | head -10

echo ""
echo "=== Done ==="
