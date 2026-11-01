#!/bin/sh
echo "=== Check index.html references ==="
grep -o 'src="[^"]*\.js"' /root/xnova/frontend-html/index.html | head -5
grep -o 'href="[^"]*\.css"' /root/xnova/frontend-html/index.html | head -5

echo ""
echo "=== Check all referenced assets exist ==="
cd /root/xnova/frontend-html
for f in $(grep -o 'src="[^"]*"' index.html | sed 's/src="//;s/"//' | grep -v '^http'); do
  if [ ! -f "$f" ]; then
    echo "MISSING: $f"
  fi
done
for f in $(grep -o 'href="[^"]*"' index.html | sed 's/href="//;s/"//' | grep -v '^http\|^#'); do
  if [ ! -f "$f" ]; then
    echo "MISSING: $f"
  fi
done
echo "Check complete."

echo ""
echo "=== Check sw.js content ==="
cat /root/xnova/frontend-html/sw.js
