#!/bin/sh
echo "=== Check dist WalletPage date ==="
ls -la /root/xnova/dist/assets/WalletPage-CpEuQf3F.js 2>&1

echo ""
echo "=== Check what other files are in dist ==="
ls /root/xnova/dist/assets/ 2>&1 | head -20

echo ""
echo "=== Check dist index.html ==="
ls -la /root/xnova/dist/index.html 2>&1

echo ""
echo "=== That 1 USDT ref in the good version ==="
grep -o '.\{0,100\}USDT.\{0,100\}\|.\{0,100\}usdt.\{0,100\}' /root/xnova/dist/assets/WalletPage-CpEuQf3F.js 2>&1
