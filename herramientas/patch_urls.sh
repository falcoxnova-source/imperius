#!/bin/bash
cd /root/xnova/frontend-html/assets
echo "=== Files with localhost:8000 (before) ==="
grep -l 'http://localhost:8000' *.js 2>/dev/null

echo
echo "=== Patching ==="
for f in *.js; do
  case "$f" in
    *supabase*) continue ;;
  esac
  if grep -q 'http://localhost:8000' "$f"; then
    sed -i 's|http://localhost:8000||g' "$f"
    echo "Patched: $f"
  fi
done

echo
echo "=== Files with localhost:8000 (after) ==="
grep -l 'http://localhost:8000' *.js 2>/dev/null || echo "NONE - all patched"

echo
echo "=== Verify WalletPage now uses relative URL ==="
grep -oE 'wallet-info[^"]{0,40}|.{30}wallet-info' WalletPage-*.js | head -3

echo
echo "=== Test the endpoint reaches python ==="
curl -s https://tung.xnova.xyz/functions/v1/wallet-info | head -c 250
