#!/bin/sh
echo "=== Dist index.html wallet reference ==="
grep -o 'WalletPage-[^"]*\.js' /root/xnova/dist/index.html 2>/dev/null
echo "(dist)"

echo ""
echo "=== Current frontend index.html wallet reference ==="
grep -o 'WalletPage-[^"]*\.js' /root/xnova/frontend-html/index.html 2>/dev/null
echo "(current frontend)"

echo ""
echo "=== Dist wallet files ==="
ls /root/xnova/dist/assets/WalletPage-*.js 2>/dev/null

echo ""
echo "=== Current wallet files ==="
ls /root/xnova/frontend-html/assets/WalletPage-*.js 2>/dev/null

echo ""
echo "=== Missing: does dist have file that frontend references? ==="
WALLET_REF=$(grep -o 'WalletPage-[^"]*\.js' /root/xnova/frontend-html/index.html 2>/dev/null)
if [ -n "$WALLET_REF" ]; then
  echo "index.html refs: $WALLET_REF"
  ls -la /root/xnova/frontend-html/assets/$WALLET_REF 2>/dev/null || echo "MISSING!"
fi
