#!/bin/bash
NEW=$(grep -o 'assets/index-[A-Za-z0-9_]*\.js' /root/xnova/frontend-html/index.html | sort -u | head -1)
echo "=== Current referenced main bundle: $NEW ==="

echo "=== Remove orphan index-*.js bundles not referenced by index.html ==="
NEWBASE=$(basename "$NEW")
for f in /root/xnova/frontend-html/assets/index-*.js; do
  b=$(basename "$f")
  if [ "$b" != "$NEWBASE" ]; then
    echo "Removing orphan: $b"
    rm -f "$f"
  fi
done

echo "=== Verify USDT label present in served bundle ==="
curl -sk "https://localhost/$NEW" | grep -o 'USDT' | head -1 && echo "USDT label present (good)" || echo "NOT found"

echo "=== Confirm dashboard shows USDT alongside (sample marker) ==="
curl -sk "https://localhost/$NEW" | grep -o 'Deuda TUNG con usuarios' | head -1 && echo "dashboard bundle served"
