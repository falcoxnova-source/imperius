#!/bin/bash
docker exec xnova-database psql -U postgres -d postgres -c "SELECT * FROM public.market_resource_limits;"
echo "---"
docker exec xnova-database psql -U postgres -d postgres -c "SELECT proname, pronargs FROM pg_proc WHERE proname LIKE '%market_limit%' OR proname LIKE '%monthly_limit%' ORDER BY proname;"
echo "---FUNCTIONS---"
docker exec xnova-database psql -U postgres -d postgres -c "SELECT proname, pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'admin_update_market_resource_limits' ORDER BY pronargs;"
