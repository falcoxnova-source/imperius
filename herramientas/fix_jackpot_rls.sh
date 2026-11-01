#!/bin/sh
echo "=== Fix RLS: Add anon to jackpot_pools policy ==="
docker exec xnova-database psql -U postgres -d postgres -c "
DROP POLICY IF EXISTS \"Anyone can view jackpot pools\" ON public.jackpot_pools;
CREATE POLICY \"Anyone can view jackpot pools\" ON public.jackpot_pools
  FOR SELECT
  TO anon, authenticated
  USING (true);
" 2>&1

echo ""
echo "=== Verify policy ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT policyname, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'jackpot_pools'
" 2>&1

echo ""
echo "=== Test REST with anon key + single-object Accept ==="
curl -sk -w "\nHTTP %{http_code}\n" \
  -H 'Accept: application/vnd.pgrst.object+json' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ' \
  'https://127.0.0.1/rest/v1/jackpot_pools?select=*&id=eq.1' 2>&1 | head -c 500

echo ""
echo ""
echo "=== Test WebSocket still 426 ==="
curl -sk -w "\nHTTP %{http_code}\n" 'https://127.0.0.1/realtime/v1/websocket' 2>&1
