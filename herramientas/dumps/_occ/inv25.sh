Q() { docker exec -i xnova-database psql -U postgres -d postgres -At -c "$1" < /dev/null; }
echo "== funcs using is_upgrading"; Q "select proname from pg_proc where pronamespace='public'::regnamespace and prosrc ilike '%is_upgrading%'"
echo "== contribute_to_jackpot"; Q "select prosrc from pg_proc where proname='contribute_to_jackpot'"
echo "== record_admin_revenue"; Q "select prosrc from pg_proc where proname='record_admin_revenue'" | head -60
echo "== _internal_set_fxu_context"; Q "select prosrc from pg_proc where proname='_internal_set_fxu_context'"
echo "== funcs with item_code param"; Q "select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and 'p_item_code' = any(proargnames)"
echo "== create_market_listing ship handling"; Q "select prosrc from pg_proc where proname='create_market_listing'" | grep -n -i "ship\|item_code\|BEGIN\|EXCEPTION" | head -30
echo "== buy offers funcs"; Q "select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and (proname ilike '%buy_offer%' or proname ilike '%p2p%' or proname ilike '%gift%' or proname ilike '%trade%')"
echo "== process_completed_building_queue"; Q "select prosrc from pg_proc where proname='process_completed_building_queue'" | head -80
echo "== building_queue statuses"; Q "select status, count(*) from building_queue group by 1"
Q "select status, count(*) from shipyard_queue group by 1"
echo "== ship_types seq"; Q "select pg_get_serial_sequence('public.ship_types','id'), (select max(id) from ship_types)"
Q "select last_value from ship_types_id_seq" 2>&1
echo "== ship_types category check"; Q "select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.ship_types'::regclass"
Q "select distinct category from ship_types"
echo "== colony_ship row"; Q "select * from ship_types where code='colony_ship'"
echo "== fleets checks"; Q "select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.fleets'::regclass and contype='c'"
echo "== get_live_tung_price_usd"; Q "select public.get_live_tung_price_usd()"
echo "== has pg_cron schedule fn"; Q "select oid::regprocedure from pg_proc where proname='schedule' and pronamespace='cron'::regnamespace"
echo "== ws/edge processes fleets? function list w/ fleet_arrival"; Q "select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and prosrc ilike '%process_fleet_arrival(%' "
echo "== user_can_build_ship callers"; Q "select proname from pg_proc where pronamespace='public'::regnamespace and prosrc ilike '%user_can_build_ship%'"
echo "== get_game_speed val"; Q "select public.get_game_speed()"
echo "== jackpot source check"; Q "select pg_get_constraintdef(oid) from pg_constraint where conrelid in (select oid from pg_class where relname ilike '%jackpot%') and contype='c'"
