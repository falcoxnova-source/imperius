#!/bin/bash
set -e
TS=$(date +%Y%m%d_%H%M%S)
Q() { docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c "$1"; }
mkdir -p /root/backups
Q "select pg_get_functiondef(p.oid)||';' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('_occ_try_start','get_occupation_ship_info','get_occupation_overview')" > /root/backups/ocupa4_pre_$TS.sql
echo "backup /root/backups/ocupa4_pre_$TS.sql ($(wc -l < /root/backups/ocupa4_pre_$TS.sql) lines)"
docker cp /tmp/ocupa4.sql xnova-database:/tmp/ocupa4.sql
docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 -f /tmp/ocupa4.sql
echo "== verify lines"
Q "select p.proname||' :: '||l from pg_proc p, regexp_split_to_table(p.prosrc, E'\n') l where p.proname in ('_occ_try_start','get_occupation_ship_info','get_occupation_overview') and l like '%OCUPA4%'"
echo "== acl / secdef"
Q "select p.oid::regprocedure||' secdef='||p.prosecdef||' acl='||coalesce(p.proacl::text,'NULL') from pg_proc p where p.proname in ('_occ_try_start','get_occupation_ship_info','get_occupation_overview')"
echo "== anon/public exec"
Q "select p.proname||' anon='||has_function_privilege('anon',p.oid,'EXECUTE')||' auth='||has_function_privilege('authenticated',p.oid,'EXECUTE') from pg_proc p where p.proname in ('_occ_try_start','get_occupation_ship_info','get_occupation_overview')"
