Q() { docker exec -i xnova-database psql -U postgres -d postgres -At -c "$1" < /dev/null; }
for f in secure_add_to_building_queue secure_activate_building_queue complete_building_queue_item process_building_queue_internal global_process_all_expired_queues optimized_global_queue_processor process_all_user_building_queues apply_attack_building_damage secure_demolish_building; do
  echo "=== $f"
  Q "select prosrc from pg_proc where proname='$f'" | grep -n -i -B2 -A2 'is_upgrading'
done
echo "=== current is_upgrading rows"; Q "select count(*) from planet_buildings where is_upgrading"
Q "select count(*) from planet_buildings pb where is_upgrading and not exists (select 1 from building_queue bq where bq.planet_id=pb.planet_id and bq.building_type_id=pb.building_type_id)"
echo "=== cron/other callers of process queues"; Q "select proname from pg_proc where pronamespace='public'::regnamespace and (prosrc ilike '%optimized_global_queue_processor%' or prosrc ilike '%global_process_all_expired_queues%' or prosrc ilike '%process_shipyard_queue_core%')"
echo "=== process_shipyard_queue_core head"; Q "select prosrc from pg_proc where proname='process_shipyard_queue_core'" | head -70
