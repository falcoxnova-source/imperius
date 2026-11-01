#!/bin/bash
echo "=== Files containing marketFeeInfo new string (VIP . 10%) ==="
grep -rl "VIP . 10%, Top 50 . 15%" /root/xnova/frontend-html/assets/*.js 2>/dev/null

echo
echo "=== Any OLD market string still present (VIP . 7.5% / Top 200 . 25%) ? ==="
if grep -rl "VIP . 7.5%, Top 50 . 10%" /root/xnova/frontend-html/assets/*.js 2>/dev/null; then
  echo "OLD STILL PRESENT (bad)"
else
  echo "OLD market fee string gone (good)"
fi

echo
echo "=== Freshness of deployed index.html ==="
ls -l --time-style=+%H:%M /root/xnova/frontend-html/index.html
