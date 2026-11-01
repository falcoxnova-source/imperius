#!/bin/sh
echo "=== Fix get_my_monthly_market_sales: Add SECURITY DEFINER ==="
docker exec xnova-database psql -U postgres -d postgres -c "
ALTER FUNCTION public.get_my_monthly_market_sales() SECURITY DEFINER;
ALTER FUNCTION public.get_my_monthly_market_sales() SET search_path TO 'public';
" 2>&1

echo ""
echo "=== Verify fix ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT proname, prosecdef, proconfig
FROM pg_proc 
WHERE proname = 'get_my_monthly_market_sales'
" 2>&1

echo ""
echo "=== Test function call via REST ==="
# Try calling via curl through nginx with anon key
curl -sk -X POST 'https://127.0.0.1/rest/v1/rpc/get_my_monthly_market_sales' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ' \
  -H 'Content-Type: application/json' 2>&1 | head -c 300

echo ""
echo "=== Revoke auth schema grants (security) ==="
docker exec xnova-database psql -U postgres -d postgres -c "
REVOKE USAGE ON SCHEMA auth FROM anon, authenticated;
REVOKE SELECT ON ALL TABLES IN SCHEMA auth FROM anon, authenticated;
" 2>&1
echo "Done."
