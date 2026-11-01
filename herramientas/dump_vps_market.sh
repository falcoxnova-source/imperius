#!/bin/bash
# Dump create_market_listing function from VPS
docker exec xnova-database psql -U postgres -d postgres -t -A -c "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'create_market_listing' AND pronargs = 5 AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');" > /tmp/vps_market_func.sql
echo "Lines: $(wc -l < /tmp/vps_market_func.sql)"
grep -n 'vip\|VIP\|plus\|subscription\|monthly_limit_enabled' /tmp/vps_market_func.sql
