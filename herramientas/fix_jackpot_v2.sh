#!/bin/sh
echo "=== Verify jackpot row was inserted ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT id FROM public.jackpot_pools" 2>&1

echo ""
echo "=== Check table defaults ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT column_name, column_default, is_nullable, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'jackpot_pools'
ORDER BY ordinal_position
" 2>&1

echo ""
echo "=== Insert with all default values ==="
docker exec xnova-database psql -U postgres -d postgres -c "
INSERT INTO public.jackpot_pools (id, expedition_balance, expedition_total, monthly_balance, monthly_total, plus_balance, plus_total, expedition_percent, monthly_percent, plus_percent, destruction_ranking_reset_at, destruction_balance, destruction_total, destruction_percent)
VALUES (1, 0, 0, 0, 0, 0, 0, 0, 0, 0, now(), 0, 0, 0)
ON CONFLICT (id) DO NOTHING;
" 2>&1

echo ""
echo "=== Verify again ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT id FROM public.jackpot_pools" 2>&1

echo ""
echo "=== Test REST with single object ==="
curl -sk -w "\nHTTP %{http_code}\n" \
  -H 'Accept: application/vnd.pgrst.object+json' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ' \
  'https://127.0.0.1/rest/v1/jackpot_pools?select=*&id=eq.1' 2>&1 | head -c 500
