#!/bin/sh
echo "=== Test get_user_daily_missions ==="
# Get user ID for falcoxcorp
USER_ID=$(docker exec xnova-database psql -U postgres -d postgres -t -c "SELECT id FROM auth.users WHERE email = 'falcoxcorp@gmail.com' LIMIT 1" 2>&1 | tr -d ' ')
echo "User ID: $USER_ID"

echo ""
echo "=== Call get_user_daily_missions RPC ==="
curl -sk -X POST 'https://127.0.0.1/rest/v1/rpc/get_user_daily_missions' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ' \
  -H 'Content-Type: application/json' \
  -d '{}' 2>&1 | head -c 300

echo ""
echo ""
echo "=== Total active free missions ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT COUNT(*) as active_free FROM public.daily_missions WHERE is_active = true AND cost_fxu = 0
" 2>&1

echo ""
echo "=== All active missions ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT id, code, mission_type, target_count, reward_type, reward_value, title_es, cost_fxu
FROM public.daily_missions 
WHERE is_active = true
ORDER BY cost_fxu, id
" 2>&1
