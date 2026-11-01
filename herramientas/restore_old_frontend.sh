#!/bin/sh
echo "=== Restoring old frontend from backup ==="
BACKUP_DIR=$(ls -d /root/xnova/frontend-html-backup-* | tail -1)
echo "Using backup: $BACKUP_DIR"

# Remove current frontend files
rm -rf /root/xnova/frontend-html/assets/*
rm -f /root/xnova/frontend-html/index.html
rm -rf /root/xnova/frontend-html/about /root/xnova/frontend-html/blog /root/xnova/frontend-html/ganar-* /root/xnova/frontend-html/juegos-* /root/xnova/frontend-html/alternativa-* /root/xnova/frontend-html/5-pasos-* /root/xnova/frontend-html/roadmap /root/xnova/frontend-html/terms /root/xnova/frontend-html/privacy

# Copy old files back
cp -r $BACKUP_DIR/* /root/xnova/frontend-html/

echo ""
echo "=== Verify old supabase JS is back ==="
ls -la /root/xnova/frontend-html/assets/supabase-*.js

echo ""
echo "=== Verify old MarketPage ==="
ls -la /root/xnova/frontend-html/assets/MarketPage-*.js

echo ""
echo "=== Test 403 RPC is gone ==="
curl -sk -o /dev/null -w "RPC HTTP code: %{http_code}\n" -X POST 'https://127.0.0.1/rest/v1/rpc/get_my_monthly_market_sales' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ' \
  -H 'Content-Type: application/json' 2>&1

echo ""
echo "=== Done ==="
