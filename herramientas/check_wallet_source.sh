#!/bin/sh
echo "=== USDT refs in VPS source WalletPage.tsx ==="
grep -c "USDT\|usdt\|Usdt" /root/xnova/src/pages/game/WalletPage.tsx 2>&1

echo ""
echo "=== Also check dist version ==="
grep -c "USDT\|usdt\|Usdt" /root/xnova/dist/assets/WalletPage-CpEuQf3F.js 2>&1

echo ""
echo "=== Check if there's a backup of source ==="
find /root/xnova -name "WalletPage*" -type f 2>/dev/null

echo ""
echo "=== Check git log for wallet changes ==="
cd /root/xnova 2>/dev/null && git log --oneline -5 -- src/pages/game/WalletPage.tsx 2>/dev/null || echo "No git repo"
