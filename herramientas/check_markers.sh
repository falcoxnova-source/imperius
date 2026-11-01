#!/bin/bash
PSQL="docker exec xnova-database psql -U postgres -d postgres -tA"

echo "=== markers present in deployed bot_ai_tick ==="
for marker in "ai_planet_custom_orders" "v_planet_role" "military_smart_focus" "SMART FOCUS" "intelligent_research" "terraformer" "blueprint" "mega_recycler" "vengeance" "CUSTOM MODE" "v_custom_orders"; do
  c=$(docker exec xnova-database psql -U postgres -d postgres -tA -c "SELECT (position('$marker' in pg_get_functiondef('public.bot_ai_tick()'::regprocedure)) > 0);")
  echo "$marker : $c"
done

echo
echo "=== ai_planet_custom_orders table exists? schema ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_planet_custom_orders' ORDER BY ordinal_position;"
