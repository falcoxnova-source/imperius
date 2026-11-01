set -e
rm -rf /tmp/occinv6d; mkdir -p /tmp/occinv6d
Q() { docker exec -i xnova-database psql -U postgres -d postgres -At -c "$1" < /dev/null; }
docker exec -i xnova-database psql -U postgres -d postgres -At << "SQLEOF" > /tmp/occinv6d/misc.txt
SELECT 'resdec: '||p.proname||'('||pg_get_function_identity_arguments(p.oid)||') auth='||has_function_privilege('authenticated',p.oid,'EXECUTE')||' colock='||(p.prosrc ILIKE '%_colony_listed_since%')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind='f' AND p.prosrc ILIKE '%planet_resources%'
  AND p.prosrc ~* '(metal|crystal|deuterium)\s*=\s*(pr\.|r\.)?(metal|crystal|deuterium)\s*-'
ORDER BY 1;
SELECT 'trg fleets: '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.fleets'::regclass AND NOT tgisinternal;
SELECT 'trg planets: '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.planets'::regclass AND NOT tgisinternal;
SELECT 'trg planet_resources: '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.planet_resources'::regclass AND NOT tgisinternal;
SELECT 'trg building_queue: '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.building_queue'::regclass AND NOT tgisinternal;
SELECT 'trg shipyard_queue: '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.shipyard_queue'::regclass AND NOT tgisinternal;
SELECT 'trg fleet_ships: '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.fleet_ships'::regclass AND NOT tgisinternal;
SELECT 'trg planet_defenses: '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.planet_defenses'::regclass AND NOT tgisinternal;
SELECT 'trg planet_ships: '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.planet_ships'::regclass AND NOT tgisinternal;
SELECT 'planets cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='planets';
SELECT 'pr cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='planet_resources';
SELECT 'rc cols: '||string_agg(column_name||':'||data_type||':'||is_nullable,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='referral_commissions';
SELECT 'rc con: '||conname||' '||pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.referral_commissions'::regclass;
SELECT 'fcalc: '||proname||'('||pg_get_function_identity_arguments(oid)||') -> '||pg_get_function_result(oid) FROM pg_proc WHERE proname IN ('fleet_calc_distance','fleet_calc_slowest_speed','fleet_calc_flight_time','fleet_calc_fuel','update_planet_resources','calculate_planet_resources','user_can_build_ship','perform_combat','apply_attack_building_damage','check_moon_creation','battle_units_diff','_internal_set_fxu_context','get_max_fleet_slots','process_user_pending_fleets');
SELECT 'ships: '||id||' '||code||' '||category||' spd='||base_speed||' fuel='||fuel_consumption FROM ship_types ORDER BY id;
SELECT 'defs: '||id||' '||code||' m='||metal_cost||' c='||crystal_cost||' d='||deuterium_cost FROM defense_types ORDER BY id;
SELECT 'debris cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='debris_fields';
SELECT 'br cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='battle_reports';
SELECT 'msg cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='messages';
SELECT 'ut cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='user_technologies';
SELECT 'pb cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='planet_buildings';
SELECT 'gs cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='game_settings';
SELECT 'speed fns: '||proname FROM pg_proc WHERE proname ILIKE '%drive%' OR proname ILIKE '%ship_speed%';
SQLEOF
dumpfn() {
  f=$1; i=0
  Q "SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='$f' AND p.prokind='f' ORDER BY p.oid" > /tmp/occinv6d/_oids.txt
  while read oid; do
    i=$((i+1))
    Q "SELECT pg_get_functiondef($oid)" > /tmp/occinv6d/fn_${f}_$i.sql
  done < /tmp/occinv6d/_oids.txt
}
for f in fleet_calc_distance fleet_calc_slowest_speed fleet_calc_flight_time fleet_calc_fuel user_can_build_ship update_planet_resources check_moon_creation perform_acs_combat process_acs_fleet_arrival join_acs_with_fleet create_acs_from_fleet process_user_pending_fleets process_user_fleets fulfill_buy_offer _internal_set_fxu_context get_max_fleet_slots; do dumpfn $f; done
rm -f /tmp/occinv6d/_oids.txt
cd /tmp && tar -czf occinv6d.tgz occinv6d && ls /tmp/occinv6d | wc -l
