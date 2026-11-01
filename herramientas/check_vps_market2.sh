#!/bin/sh
echo "=== List market functions ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT proname FROM pg_proc WHERE proname LIKE '%market%' ORDER BY 1"

echo ""
echo "=== market_resource_limits ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT * FROM public.market_resource_limits WHERE id = 1"

echo ""
echo "=== Check if table exists ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT relname FROM pg_class WHERE relname = 'market_resource_limits'"

echo ""
echo "=== Check user plus subscriptions ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT user_id, is_active, expires_at FROM public.plus_subscriptions WHERE is_active = true LIMIT 5"
