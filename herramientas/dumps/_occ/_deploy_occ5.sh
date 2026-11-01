#!/bin/bash
set -e
TS=$(date +%Y%m%d_%H%M%S)
Q() { docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c "$1"; }
FN="'_occ_try_start','_occ_end','occupation_transport','occupation_abandon','purchase_occupation_ship','get_occupation_ship_info','_occ_send_garrison_home'"
mkdir -p /root/backups
Q "select pg_get_functiondef(p.oid)||';' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ($FN)" > /root/backups/ocupa5_pre_$TS.sql
echo "backup /root/backups/ocupa5_pre_$TS.sql ($(wc -l < /root/backups/ocupa5_pre_$TS.sql) lines)"
echo "== acl before"
Q "select p.oid::regprocedure||' acl='||coalesce(p.proacl::text,'NULL') from pg_proc p where p.proname in ($FN)"
docker cp /tmp/ocupa5.sql xnova-database:/tmp/ocupa5.sql
docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 -f /tmp/ocupa5.sql
echo "== verify lines"
Q "select p.proname||' :: '||l from pg_proc p, regexp_split_to_table(p.prosrc, E'\n') l where p.proname in ($FN) and l like '%OCUPA5%'"
echo "== no 25 left"
Q "select p.proname||' :: '||l from pg_proc p, regexp_split_to_table(p.prosrc, E'\n') l where p.proname in ('purchase_occupation_ship','get_occupation_ship_info') and l ~ '25'"
echo "== acl after / secdef"
Q "select p.oid::regprocedure||' secdef='||p.prosecdef||' acl='||coalesce(p.proacl::text,'NULL') from pg_proc p where p.proname in ($FN)"
echo "== anon/auth exec"
Q "select p.proname||' anon='||has_function_privilege('anon',p.oid,'EXECUTE')||' auth='||has_function_privilege('authenticated',p.oid,'EXECUTE') from pg_proc p where p.proname in ($FN)"
echo "== info price"
Q "select public.get_occupation_ship_info()::text" | head -c 400; echo
echo "== test abandon (ROLLBACK)"
cat > /tmp/o5test.sql <<'EOF'
BEGIN;
SELECT o.id AS occ, o.occupier_id AS uid, o.garrison_fleet_id AS gid FROM public.occupations o WHERE o.status='active' ORDER BY o.started_at LIMIT 1 \gset
SELECT set_config('request.jwt.claims', json_build_object('sub', :'uid', 'role','authenticated')::text, true);
SELECT id, origin_planet_id, target_galaxy||':'||target_system||':'||target_position AS tgt, departure_time, arrival_time FROM public.fleets WHERE id = :'gid';
SELECT ship_type_id, quantity FROM public.fleet_ships WHERE fleet_id = :'gid' ORDER BY ship_type_id;
SELECT public.occupation_abandon(:'occ');
SELECT is_returning, is_completed, origin_planet_id, return_time - now() AS vuelo FROM public.fleets WHERE id = :'gid';
SELECT status, end_reason FROM public.occupations WHERE id = :'occ';
ROLLBACK;
EOF
docker cp /tmp/o5test.sql xnova-database:/tmp/o5test.sql
docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/o5test.sql || echo "TEST FAILED (rolled back)"
