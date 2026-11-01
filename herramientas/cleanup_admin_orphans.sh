#!/bin/bash
# Current main bundle referenced by index.html
MAIN=$(grep -o 'assets/index-[A-Za-z0-9_]*\.js' /root/xnova/frontend-html/index.html | sort -u | head -1 | sed 's#assets/##')
echo "Main bundle: $MAIN"
# AdminPage chunk referenced by the main bundle
REF=$(grep -o 'AdminPage-[A-Za-z0-9_]*\.js' "/root/xnova/frontend-html/assets/$MAIN" | sort -u | head -1)
echo "Referenced AdminPage chunk: $REF"
echo "=== Removing orphan AdminPage chunks ==="
for f in /root/xnova/frontend-html/assets/AdminPage-*.js; do
  b=$(basename "$f")
  if [ "$b" != "$REF" ]; then
    echo "Removing orphan: $b"
    rm -f "$f"
  fi
done
echo "=== Remaining AdminPage chunks ==="
ls -1 /root/xnova/frontend-html/assets/AdminPage-*.js
echo "=== Sanity: referenced chunk has USDT markers ==="
grep -o '≈ \$' "/root/xnova/frontend-html/assets/$REF" | wc -l
