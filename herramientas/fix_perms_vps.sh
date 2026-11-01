#!/bin/sh
echo "=== Check get_my_monthly_market_sales definition ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT 
  proname,
  prosecdef,
  proconfig
FROM pg_proc 
WHERE proname = 'get_my_monthly_market_sales'
" 2>&1

echo ""
echo "=== Check other RPC functions for SECURITY DEFINER ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT proname, prosecdef 
FROM pg_proc 
WHERE proname IN ('create_market_listing', 'get_market_resource_limits', 'get_my_monthly_market_sales', 'calculate_monthly_market_limit', 'calculate_fxu_weekly_limit')
ORDER BY proname
" 2>&1

echo ""
echo "=== Grant auth schema to public functions ==="
docker exec xnova-database psql -U postgres -d postgres -c "
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO anon, authenticated;
" 2>&1
