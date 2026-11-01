#!/bin/sh
echo "=== Verify old supabase has window.location.origin ==="
grep -o "var t='[^']*'" /root/xnova/frontend-html/assets/supabase-BB4509gp.js

echo ""
echo "=== Verify RPC works (no 403) ==="
curl -sk -X POST 'https://127.0.0.1/rest/v1/rpc/get_my_monthly_market_sales' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ' \
  -H 'Content-Type: application/json' 2>&1 | head -c 300

echo ""
echo ""
echo "=== Verify index.html references correct files ==="
grep -o 'src="[^"]*\.js"' /root/xnova/frontend-html/index.html | head -3

echo ""
echo "=== Check sw.js ==="
cat /root/xnova/frontend-html/sw.js
