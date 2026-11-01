set -e
rm -rf /tmp/occinv3; mkdir -p /tmp/occinv3
for f in check_building_queue_limit recall_deployed_fleet create_market_listing purchase_colony_listing fleet_calc_slowest_speed process_expedition _shipyard_promote_next simulate_xnova_combat award_expedition_blueprint_drop log_transport_interaction secure_cancel_building secure_cancel_shipyard_item cancel_building_queue cancel_shipyard_queue instant_complete_shipyard_item secure_toggle_autopilot set_planet_autopilot validate_ship_requirements validate_defense_requirements calculate_ship_build_time calculate_defense_build_time get_galaxy_view get_planet_details secure_rename_planet create_acs_from_fleet perform_acs_combat get_player_planets get_my_planets apply_attack_building_damage _bs_settle purchase_instant_unit; do
  i=0
  docker exec -i xnova-database psql -U postgres -d postgres -At -c "SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='$f' ORDER BY p.oid" < /dev/null > /tmp/occinv3/_oids.txt
  while read oid; do
    i=$((i+1))
    docker exec -i xnova-database psql -U postgres -d postgres -At -c "SELECT pg_get_functiondef($oid)" < /dev/null > /tmp/occinv3/fn_${f}_$i.sql
  done < /tmp/occinv3/_oids.txt
done
rm -f /tmp/occinv3/_oids.txt
docker exec -i xnova-database psql -U postgres -d postgres -At << "SQLEOF" > /tmp/occinv3/names.txt
SELECT p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND (p.proname ~* 'cancel|autopilot|speed|accel|instant|galaxy|planet_detail|rename|abandon|market_listing|colony|recall|acs|fleet_preview|shipyard|building_queue|refill|missile|move_resources|transfer') ORDER BY 1;
SQLEOF
docker exec -i xnova-database psql -U postgres -d postgres -At << "SQLEOF" > /tmp/occinv3/misc.txt
SELECT 'ship_types cols: '||string_agg(column_name||':'||data_type||':'||coalesce(column_default,''),' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='ship_types';
SELECT 'ship 3: '||row_to_json(s)::text FROM ship_types s WHERE id=3;
SELECT 'max ship id: '||max(id) FROM ship_types;
SELECT 'acs_fleets cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='acs_fleets';
SELECT 'acs_participants cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='acs_participants';
SELECT 'battle_reports cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='battle_reports';
SELECT 'planet_defenses cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='planet_defenses';
SELECT 'defense_types cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='defense_types';
SELECT 'referral_commissions cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='referral_commissions';
SELECT 'cron: '||jobid||' '||schedule||' '||jobname||' '||left(command,120) FROM cron.job ORDER BY jobid;
SELECT 'rt pub: '||tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY 1;
SELECT 'admin_rev_check: '||pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='admin_revenue_revenue_type_check';
SELECT 'refcomm_check: '||conname||' '||pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.referral_commissions'::regclass AND contype='c';
SELECT 'jackpot_src_check: '||conname||' '||pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='c' AND pg_get_constraintdef(oid) ILIKE '%jackpot%';
SELECT 'blueprints for ship: '||count(*) FROM ship_blueprints;
SELECT 'market listing_type check: '||conname||' '||pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.market_listings'::regclass AND contype='c';
SELECT 'market cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='market_listings';
SELECT 'fleet_ship refs to ship code in funcs: '||p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND pg_get_functiondef(p.oid) ~* 'colony_ship' ORDER BY 1;
SQLEOF
cd /tmp && tar -czf occinv3.tgz occinv3 && ls -la /tmp/occinv3 | wc -l
