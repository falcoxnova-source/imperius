#!/bin/sh
echo "=== Check Python WS server ==="
systemctl status xnova-ws --no-pager -l

echo ""
echo "=== Check if port 9090 is listening ==="
ss -tlnp | grep 9090

echo ""
echo "=== Test Python server directly ==="
echo -e "GET /realtime/v1/websocket HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n" | nc 127.0.0.1 9090 | head -20

echo ""
echo "=== Check nginx error log ==="
docker logs xnova-kong --tail 10 2>&1

echo ""
echo "=== Test via nginx with verbose ==="
curl -sk -v 'https://127.0.0.1/realtime/v1/websocket' 2>&1 | head -30
