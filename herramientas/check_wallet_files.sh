#!/bin/sh
echo "=== Current wallet files ==="
ls -la /root/xnova/frontend-html/assets/WalletPage-*.js 2>&1

echo ""
echo "=== Check for backup wallet files ==="
find /root/xnova -name "WalletPage*" -type f 2>/dev/null

echo ""
echo "=== Check if .env has wallet key ==="
cat /root/xnova/.env 2>/dev/null | grep -i wallet
echo "---"
cat /root/xnova/deposit_service.py 2>/dev/null | grep -i "private_key\|PRIVATE_KEY\|wallet_address\|WALLET"
