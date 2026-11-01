#!/bin/sh
echo "=== Check bak2 for USDT references ==="
grep -c "USDT\|usdt\|Usdt" /root/xnova/frontend-html/assets/WalletPage-BmVmSLrh.js.bak2 2>&1
echo "bak2 USDT count: above"

echo ""
echo "=== Check current (new build) for USDT references ==="
grep -c "USDT\|usdt\|Usdt" /root/xnova/frontend-html/assets/WalletPage-C6NtlJQV.js 2>&1
echo "new USDT count: above"

echo ""
echo "=== Check current (old restored) for USDT references ==="
grep -c "USDT\|usdt\|Usdt" /root/xnova/frontend-html/assets/WalletPage-BmVmSLrh.js 2>&1
echo "old restored USDT count: above"

echo ""
echo "=== Which wallet does index.html reference? ==="
grep -o 'WalletPage-[^"]*\.js' /root/xnova/frontend-html/index.html 2>&1
echo "(No direct ref = lazy loaded by main index)"

echo ""
echo "=== .env full contents ==="
cat /root/xnova/.env 2>/dev/null
