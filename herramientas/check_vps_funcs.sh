#!/bin/sh
echo "=== VPS get_my_monthly_market_sales ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT prosrc FROM pg_proc WHERE proname = 'get_my_monthly_market_sales'" 2>&1

echo ""
echo "=== VPS DB monthly_limit_enabled ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT id, monthly_limit_enabled FROM market_resource_limits WHERE id = 1" 2>&1

echo ""
echo "=== VPS is_user_plus function ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT prosrc FROM pg_proc WHERE proname = 'is_user_plus'" 2>&1
