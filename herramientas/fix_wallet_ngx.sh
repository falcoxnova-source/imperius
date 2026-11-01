#!/bin/sh
echo "=== Current wallet-info in nginx ==="
grep -A 5 "wallet-info" /root/xnova/nginx/default-local.conf

echo ""
echo "=== Force fix with sed ==="
# Remove usdtContract and usdtDepositsEnabled from the JSON
sed -i 's|"usdtContract":"",||' /root/xnova/nginx/default-local.conf
sed -i 's|,"usdtDepositsEnabled":false||' /root/xnova/nginx/default-local.conf

echo ""
echo "=== After sed ==="
grep -A 3 "wallet-info" /root/xnova/nginx/default-local.conf

echo ""
echo "=== Reload nginx ==="
docker exec xnova-kong nginx -t 2>&1 && docker exec xnova-kong nginx -s reload 2>&1

echo ""
echo "=== Test ==="
curl -sk 'https://127.0.0.1/functions/v1/wallet-info' 2>&1
