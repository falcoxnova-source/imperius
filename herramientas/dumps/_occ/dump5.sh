set -e
rm -rf /tmp/occinv5d; mkdir -p /tmp/occinv5d
Q() { docker exec -i xnova-database psql -U postgres -d postgres -At -c "$1" < /dev/null; }
dumpfn() {
  f=$1; i=0
  Q "SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='$f' ORDER BY p.oid" > /tmp/occinv5d/_oids.txt
  while read oid; do
    i=$((i+1))
    Q "SELECT pg_get_functiondef($oid)" > /tmp/occinv5d/fn_${f}_$i.sql
  done < /tmp/occinv5d/_oids.txt
}
for f in recall_deployed_fleet perform_combat process_all_pending_fleets secure_start_research _trg_colony_sale_lock_research _trg_colony_sale_lock_queue _trg_colony_sale_lock_fleet _trg_colony_sale_lock_autopilot validate_defense_requirements validate_ship_requirements get_game_speed cancel_fleet get_user_fleets get_my_fleets admin_get_game_config; do dumpfn $f; done
Q "SELECT DISTINCT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosrc ~* 'insert\s+into\s+(public\.)?acs_fleets'" > /tmp/occinv5d/acs_creators.txt
while read f; do dumpfn $f; done < /tmp/occinv5d/acs_creators.txt
docker exec -i xnova-database psql -U postgres -d postgres -At << "SQLEOF" > /tmp/occinv5d/misc.txt
SELECT 'sq cols: '||string_agg(column_name||':'||data_type||':'||coalesce(column_default,''),' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='shipyard_queue';
SELECT 'ps cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='planet_ships';
SELECT 'pd cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='planet_defenses';
SELECT 'st cols: '||string_agg(column_name||':'||data_type||':'||coalesce(column_default,''),' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='ship_types';
SELECT 'profiles cols: '||string_agg(column_name||':'||data_type,' | ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles';
SELECT 'con '||conrelid::regclass||': '||conname||' '||pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN ('public.fleet_ships'::regclass,'public.planet_ships'::regclass,'public.planet_defenses'::regclass,'public.shipyard_queue'::regclass,'public.building_queue'::regclass,'public.ship_types'::regclass,'public.admin_revenue'::regclass,'public.battle_reports'::regclass);
SELECT 'trg ut: '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.user_technologies'::regclass AND NOT tgisinternal;
SELECT 'trg acs_fleets: '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.acs_fleets'::regclass AND NOT tgisinternal;
SELECT 'trg acs_participants: '||pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE tgrelid='public.acs_participants'::regclass AND NOT tgisinternal;
SELECT 'fns calling recall_deployed_fleet: '||p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosrc ILIKE '%recall_deployed_fleet%';
SELECT 'fns calling process_fleet_arrival: '||p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosrc ILIKE '%process_fleet_arrival(%';
SELECT 'fns update fleets stationed: '||p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosrc ILIKE '%mission_type = ''deploy''%';
SELECT 'admin profile: '||id||' '||coalesce(username,'') FROM profiles WHERE is_admin = true ORDER BY created_at LIMIT 3;
SELECT 'revtype check: '||pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='admin_revenue_revenue_type_check';
SELECT 'gs sample: '||key||'='||value FROM game_settings WHERE key ~* 'colony|instant|price|usd' ORDER BY key LIMIT 30;
SELECT 'cron jobs: '||jobname||' | '||schedule FROM cron.job ORDER BY jobname;
SELECT 'jackpot sig: '||pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname IN ('contribute_to_jackpot','record_admin_revenue','_distribute_shareholder_share','get_live_tung_price_usd','is_admin','check_is_admin');
SELECT 'auth helper: '||proname||'('||pg_get_function_identity_arguments(oid)||')' FROM pg_proc WHERE proname ~* '^(is_admin|check_admin|is_user_admin|_is_admin|require_admin|assert_admin)';
SQLEOF
rm -f /tmp/occinv5d/_oids.txt
cd /tmp && tar -czf occinv5d.tgz occinv5d && ls /tmp/occinv5d | wc -l
