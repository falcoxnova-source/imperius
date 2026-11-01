#!/bin/bash
echo "=== VPS get_market_resource_limits ==="
docker exec xnova-database psql -U postgres -d postgres -A -t -c "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'get_market_resource_limits' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');"

echo "=== VPS create_market_listing full ==="
docker exec xnova-database psql -U postgres -d postgres -A -t -c "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'create_market_listing' AND pronargs = 5 AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');" > /tmp/vps_create_market.sql
wc -l /tmp/vps_create_market.sql
grep -n 'monthly_limit_enabled\|vip\|VIP\|plus\|subscription\|is_user_plus' /tmp/vps_create_market.sql
