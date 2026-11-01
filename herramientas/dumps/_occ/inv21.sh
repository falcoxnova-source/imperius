Q() { docker exec -i xnova-database psql -U postgres -d postgres -At -c "$1" < /dev/null; }
for f in bot_ai_tick process_fleet_arrival process_expedition; do
  echo "=== $f"
  Q "select prosrc from pg_proc where proname='$f'" > /tmp/src_$f.txt
  grep -n -i -A10 'from ship_types' /tmp/src_$f.txt | grep -i -E 'from ship_types|where|code|random|user_can|validate|category|limit' | head -60
done
echo "=== calculate_and_sync_resources_internal"
Q "select oid::regprocedure, prorettype::regtype from pg_proc where proname in ('calculate_and_sync_resources_internal','calculate_planet_resources','distribute_spend_fee','has_active_officer')"
echo "=== calculate_planet_resources auth"
Q "select prosrc from pg_proc where proname='calculate_planet_resources'" | grep -n -i 'auth\|unauthor' | head
Q "select prosrc from pg_proc where proname='calculate_and_sync_resources_internal'" | grep -n -i 'auth\|unauthor' | head
echo "=== notify_hostile_fleet_incoming"
Q "select prosrc from pg_proc where proname='notify_hostile_fleet_incoming'"
echo "=== enforce_ship_blueprint_requirement head"
Q "select left(prosrc,600) from pg_proc where proname='enforce_ship_blueprint_requirement'"
echo "=== _trg_colony_sale_lock_fleet"
Q "select prosrc from pg_proc where proname='_trg_colony_sale_lock_fleet'"
echo "=== check_single_research"
Q "select prosrc from pg_proc where proname='check_single_research'"
