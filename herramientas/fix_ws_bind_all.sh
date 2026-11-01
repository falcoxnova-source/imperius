#!/bin/sh
echo "=== Fix Python WS server to listen on 0.0.0.0 ==="

# Update the Python script
sed -i "s/HOST = '127.0.0.1'/HOST = '0.0.0.0'/" /root/xnova/ws_server.py

echo "=== Also ensure port 9090 is firewalled from external ==="
# Check if ufw is available
if command -v ufw &> /dev/null; then
    ufw deny 9090/tcp 2>&1
    echo "ufw: denied 9090/tcp"
else
    # Use iptables
    iptables -A INPUT -p tcp --dport 9090 ! -s 172.18.0.0/16 -j DROP 2>&1
    echo "iptables: blocked external 9090/tcp"
fi

echo ""
echo "=== Restart WS server ==="
systemctl restart xnova-ws
sleep 1
systemctl status xnova-ws --no-pager

echo ""
echo "=== Verify listening on 0.0.0.0 ==="
ss -tlnp | grep 9090

echo ""
echo "=== Test from host directly ==="
echo -e "GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n" | timeout 2 nc 172.18.0.1 9090 2>&1 | head -10

echo ""
echo "=== Test via nginx ==="
sleep 1
curl -sk -o /dev/null -w "HTTP %{http_code}\n" -H 'Upgrade: websocket' -H 'Connection: Upgrade' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Sec-WebSocket-Version: 13' 'https://127.0.0.1/realtime/v1/websocket' 2>&1

echo ""
echo "=== Nginx logs ==="
docker logs xnova-kong --tail 3 2>&1
