#!/bin/sh
cd /root/xnova/frontend-html/assets/

echo "=== 1. Patch supabase URL ==="
# Find supabase file in this build
SUPA_FILE=$(ls supabase-*.js 2>/dev/null | head -1)
echo "Supabase file: $SUPA_FILE"
if [ -n "$SUPA_FILE" ]; then
  cp "$SUPA_FILE" "$SUPA_FILE.bak3"
  # Replace localhost URL with window.location.origin
  sed -i 's|var t=`http://localhost:8000`|var t=window.location.origin|' "$SUPA_FILE"
  sed -i "s|var t='http://localhost:8000'|var t=window.location.origin|" "$SUPA_FILE"
  echo "Patched: $(grep -o 'var t=[^,;]*' "$SUPA_FILE" | head -1)"
fi

echo ""
echo "=== 2. Fix sw.js ==="
cat > /root/xnova/frontend-html/sw.js << 'EOF'
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', () => {
  self.registration.unregister();
});
EOF
echo "sw.js patched"

echo ""
echo "=== 3. Verify wallet has minimal USDT ==="
WALLET_FILE=$(ls WalletPage-*.js 2>/dev/null | head -1)
echo "Wallet file: $WALLET_FILE"
grep -c "USDT" "$WALLET_FILE" 2>/dev/null
echo "USDT count ^"

echo ""
echo "=== 4. Done ==="
ls -la /root/xnova/frontend-html/index.html
