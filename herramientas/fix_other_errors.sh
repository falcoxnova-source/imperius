#!/bin/sh
echo "=== Check jackpot_pools table ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name = 'jackpot_pools'
) as exists
" 2>&1

echo ""
echo "=== Check nginx realtime config ==="
grep -A 20 "realtime" /root/xnova/nginx/default-local.conf 2>&1

echo ""
echo "=== Test jackpot_pools query via REST ==="
curl -sk 'https://127.0.0.1/rest/v1/jackpot_pools?select=*&id=eq.1' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ' 2>&1 | head -c 500
