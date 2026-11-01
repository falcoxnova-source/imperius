#!/bin/bash
echo "=== index.html references which main bundle? ==="
grep -o 'assets/index-[A-Za-z0-9_]*\.js' /root/xnova/frontend-html/index.html | sort -u

echo
echo "=== Is the OLD bundle referenced anywhere in any html? ==="
if grep -rl "index-DJIGX3A8.js" /root/xnova/frontend-html --include=*.html 2>/dev/null | head; then
  echo "OLD bundle still referenced -> DO NOT delete"
else
  echo "OLD bundle NOT referenced by any html -> safe to remove orphan"
  echo "Removing orphan old market bundle..."
  rm -f /root/xnova/frontend-html/assets/index-DJIGX3A8.js
  echo "Removed."
fi

echo
echo "=== Re-check: any OLD market fee string left? ==="
if grep -rl "VIP . 7.5%, Top 50 . 10%" /root/xnova/frontend-html/assets/*.js 2>/dev/null; then
  echo "OLD STILL PRESENT"
else
  echo "OLD gone (good)"
fi
