#!/bin/bash
set -e

echo "=== 1. Backup current files ==="
cp /root/xnova/deposit_service.py /root/xnova/deposit_service.py.bak.$(date +%s)
cp /root/xnova/nginx/default-local.conf /root/xnova/nginx/default-local.conf.bak.$(date +%s)
cp /etc/systemd/system/xnova-deposit.service /etc/systemd/system/xnova-deposit.service.bak.$(date +%s)

echo "=== 2. Deploy new deposit_service.py ==="
cp /tmp/deposit_service_new.py /root/xnova/deposit_service.py
chmod +x /root/xnova/deposit_service.py

echo "=== 3. Deploy new nginx config ==="
cp /tmp/default-local-new.conf /root/xnova/nginx/default-local.conf

echo "=== 4. Update systemd unit to use venv python ==="
sed -i 's|/usr/bin/python3 /root/xnova/deposit_service.py|/root/xnova/venv/bin/python3 /root/xnova/deposit_service.py|' /etc/systemd/system/xnova-deposit.service
echo "--- Updated unit:"
cat /etc/systemd/system/xnova-deposit.service

echo
echo "=== 5. Reload systemd + restart deposit service ==="
systemctl daemon-reload
systemctl restart xnova-deposit.service
sleep 2
systemctl status xnova-deposit.service --no-pager | head -15

echo
echo "=== 6. Quick health check on port 9001 ==="
sleep 1
curl -s http://127.0.0.1:9001/health
echo

echo
echo "=== 7. Validate nginx config syntax ==="
docker exec xnova-kong nginx -t 2>&1 | tail -5

echo
echo "=== 8. Reload nginx ==="
docker exec xnova-kong nginx -s reload

echo
echo "=== 9. Test wallet-info still works ==="
curl -s https://tung.xnova.xyz/functions/v1/wallet-info | head -c 300
echo

echo
echo "=== 10. Test auto-withdraw routing (without auth - should get 401) ==="
curl -s -X POST https://tung.xnova.xyz/functions/v1/auto-withdraw \
  -H "Content-Type: application/json" \
  -d '{"amount":1, "wallet_address":"0x387526aa3f94f5C41e6a47D8c98751273e2214A3"}'
echo

echo
echo "=== 11. Logs (last 20 lines) ==="
tail -20 /var/log/xnova-deposit.log
