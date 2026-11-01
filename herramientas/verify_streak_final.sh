#!/bin/sh
echo "=== Test get_daily_streak_status (no auth = should still work) ==="
curl -sk -X POST 'https://127.0.0.1/rest/v1/rpc/get_daily_streak_status' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ' \
  -H 'Content-Type: application/json' 2>&1 | head -c 300

echo ""
echo ""
echo "=== Verify both functions fixed ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT 'activate_daily_streak' as func, prosrc LIKE '%daily_streak_cost%' as reads_from_settings FROM pg_proc WHERE proname = 'activate_daily_streak'
UNION ALL
SELECT 'get_daily_streak_status', prosrc LIKE '%daily_streak_cost%' FROM pg_proc WHERE proname = 'get_daily_streak_status'
" 2>&1
