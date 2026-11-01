Q() { docker exec -i xnova-database psql -U postgres -d postgres -At -c "$1" < /dev/null; }
echo "== ship_types cols"; Q "select string_agg(column_name||':'||data_type, ', ' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='ship_types'"
echo "== ship_types"; Q "select id, code, category, coalesce(speed::text,'?') from ship_types order by id" 2>&1 | head -60
echo "== defense_types"; Q "select id, code, max_per_planet from defense_types order by id"
echo "== building codes"; Q "select id, code from building_types where code ilike '%shipyard%' or code ilike '%nanite%' or code ilike '%robot%'"
echo "== enforce_ship_blueprint_requirement"; Q "select prosrc from pg_proc where proname='enforce_ship_blueprint_requirement'"
echo "== user_can_build_ship"; Q "select pg_get_functiondef(oid) from pg_proc where proname='user_can_build_ship'"
echo "== planet_buildings cols"; Q "select string_agg(column_name||':'||data_type, ', ' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='planet_buildings'"
echo "== planets cols"; Q "select string_agg(column_name||':'||data_type, ', ' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='planets'"
echo "== fleets cols"; Q "select string_agg(column_name||':'||data_type||':'||coalesce(column_default,''), ', ' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='fleets'"
echo "== referral_commissions cols"; Q "select string_agg(column_name||':'||data_type||':'||is_nullable, ', ' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='referral_commissions'"
echo "== referral_commissions checks"; Q "select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.referral_commissions'::regclass"
echo "== profiles cols subset"; Q "select column_name||':'||data_type from information_schema.columns where table_schema='public' and table_name='profiles' and column_name in ('referred_by','fxu_balance','is_admin','username','battles_won','battles_lost','battles_draw','units_destroyed','units_lost','debris_metal_total','debris_crystal_total','created_at','vacation_mode')"
echo "== tables exist?"; Q "select to_regclass('public.occupations'), to_regclass('public.occupation_ship_purchases'), to_regclass('public.occupation_build_queue')"
echo "== queue delete triggers"; Q "select tgrelid::regclass, tgname, pg_get_triggerdef(oid) from pg_trigger where not tgisinternal and tgrelid in ('public.building_queue'::regclass,'public.shipyard_queue'::regclass,'public.fleets'::regclass,'public.fleet_ships'::regclass)"
echo "== cron"; Q "select jobid, jobname, schedule, command from cron.job order by jobid"
echo "== validate_ship_requirements"; Q "select prosrc from pg_proc where proname='validate_ship_requirements'"
echo "== shipyard build time formula in secure_add_to_shipyard_queue"; Q "select prosrc from pg_proc where proname='secure_add_to_shipyard_queue'" | grep -n -i 'time\|nanite\|shipyard_level\|vip\|speed' | head -40
echo "== _bs_settle"; Q "select prosrc from pg_proc where proname='_bs_settle'" | head -80
echo "== contribute_to_jackpot"; Q "select pg_get_function_identity_arguments(oid), prorettype::regtype from pg_proc where proname in ('contribute_to_jackpot','record_admin_revenue','_internal_set_fxu_context','get_live_tung_price_usd','apply_vip_time_bonus','get_game_speed')"
echo "== messages cols"; Q "select string_agg(column_name||':'||data_type||':'||is_nullable, ', ' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='messages'"
echo "== battle_reports cols"; Q "select string_agg(column_name||':'||data_type, ', ' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='battle_reports'"
echo "== planet_resources cols"; Q "select string_agg(column_name||':'||data_type, ', ' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='planet_resources'"
echo "== acs tables cols"; Q "select table_name, string_agg(column_name, ', ' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name in ('acs_fleets','acs_participants') group by 1"
