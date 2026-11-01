#!/bin/sh
echo "=== Verify DB changes ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT key, value FROM public.game_settings WHERE key = 'daily_streak_cost'" 2>&1

echo ""
echo "=== Test function via REST ==="
curl -sk -X POST 'https://127.0.0.1/rest/v1/rpc/activate_daily_streak' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ' \
  -H 'Content-Type: application/json' 2>&1 | head -c 200

echo ""
echo ""
echo "=== Function source (just the cost line) ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT prosrc FROM pg_proc WHERE proname = 'activate_daily_streak'" 2>&1 | grep -A2 "game_settings"
