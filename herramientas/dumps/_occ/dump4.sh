set -e
rm -rf /tmp/occinv4; mkdir -p /tmp/occinv4
docker exec -i xnova-database psql -U postgres -d postgres -At << "SQLEOF" > /tmp/occinv4/colmkt5_list.txt
SELECT p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.prosrc LIKE '%[COLMKT5]%' ORDER BY 1;
SQLEOF
for f in user_can_build_ship sync_planet_resources set_planet_autopilot_enabled refill_colony_resources create_colony_listing cancel_market_listing purchase_market_listing admin_update_instant_unit_offer admin_list_instant_unit_offers get_instant_unit_offers _distribute_shareholder_share secure_cancel_building_queue_item secure_cancel_shipyard_queue_item instant_complete_building instant_complete_shipyard secure_activate_building_queue accelerate_fleet_v2 fleet_calc_distance fleet_calc_flight_time fleet_calc_fuel get_user_fleet_slots is_user_plus secure_abandon_colony launch_missiles bot_military_pro_tick process_completed_shipyard_queue complete_building_queue_item; do
  i=0
  docker exec -i xnova-database psql -U postgres -d postgres -At -c "SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='$f' ORDER BY p.oid" < /dev/null > /tmp/occinv4/_oids.txt
  while read oid; do
    i=$((i+1))
    docker exec -i xnova-database psql -U postgres -d postgres -At -c "SELECT pg_get_functiondef($oid)" < /dev/null > /tmp/occinv4/fn_${f}_$i.sql
  done < /tmp/occinv4/_oids.txt
done
rm -f /tmp/occinv4/_oids.txt
docker exec -i xnova-database psql -U postgres -d postgres -At << "SQLEOF" > /tmp/occinv4/misc.txt
SELECT 'gs cols: '||string_agg(column_name||':'||data_type||':'||coalesce(column_default,''),' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='game_settings';
SELECT 'gs rls: '||relrowsecurity FROM pg_class WHERE oid='public.game_settings'::regclass;
SELECT 'gs policy: '||policyname||' '||cmd||' '||coalesce(qual,'') FROM pg_policies WHERE tablename='game_settings';
SELECT 'ship_types grants: '||grantee||' '||privilege_type FROM information_schema.role_table_grants WHERE table_name='ship_types' AND table_schema='public';
SELECT 'ship_types policy: '||policyname||' '||cmd||' '||coalesce(qual,'') FROM pg_policies WHERE tablename='ship_types';
SELECT 'ship_req cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='ship_requirements';
SELECT 'ship_req colony: '||row_to_json(r)::text FROM ship_requirements r WHERE ship_type_id=3;
SELECT 'def_req cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='defense_requirements';
SELECT 'pb cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='planet_buildings';
SELECT 'bt codes: '||string_agg(id||'='||code,' ' ORDER BY id) FROM building_types;
SELECT 'tt codes: '||string_agg(id||'='||code,' ' ORDER BY id) FROM technology_types;
SELECT 'ut cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='user_technologies';
SELECT 'pr cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='planet_resources';
SELECT 'planets cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='planets';
SELECT 'msg cols: '||string_agg(column_name||':'||data_type||':'||coalesce(column_default,''),' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='messages';
SELECT 'msg checks: '||conname||' '||pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.messages'::regclass AND contype='c';
SELECT 'fleet checks: '||conname||' '||pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.fleets'::regclass AND contype='c';
SELECT 'is_main col: '||column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('planets','profiles') AND column_name ~* 'main|home|capital';
SELECT 'refcomm cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='referral_commissions';
SELECT 'trg on planets: '||tgname||' '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.planets'::regclass AND NOT tgisinternal;
SELECT 'trg on fleets: '||tgname||' '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.fleets'::regclass AND NOT tgisinternal;
SELECT 'trg on fleet_ships: '||tgname||' '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.fleet_ships'::regclass AND NOT tgisinternal;
SELECT 'trg on planet_resources: '||tgname||' '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.planet_resources'::regclass AND NOT tgisinternal;
SELECT 'trg on planet_defenses: '||tgname||' '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.planet_defenses'::regclass AND NOT tgisinternal;
SELECT 'trg on shipyard_queue: '||tgname||' '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.shipyard_queue'::regclass AND NOT tgisinternal;
SELECT 'trg on building_queue: '||tgname||' '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.building_queue'::regclass AND NOT tgisinternal;
SELECT 'fns using ship_types: '||p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.prosrc ~* 'from\s+(public\.)?ship_types' ORDER BY 1;
SELECT 'planet main sample: '||row_to_json(x)::text FROM (SELECT p.id, p.user_id, p.planet_type, p.created_at FROM planets p ORDER BY p.created_at LIMIT 2) x;
SELECT 'cron extension: '||extname FROM pg_extension WHERE extname='pg_cron';
SELECT 'cron user: '||username FROM cron.job LIMIT 1;
SQLEOF
cd /tmp && tar -czf occinv4.tgz occinv4 && ls -la /tmp/occinv4 | wc -l
