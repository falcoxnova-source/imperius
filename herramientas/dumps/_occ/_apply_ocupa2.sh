#!/bin/bash
set -e
TS=$(date +%Y%m%d_%H%M%S)
mkdir -p /root/backups
docker exec -i -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -At <<'SQL' > /root/backups/ocupa2_pre_$TS.sql
select pg_get_functiondef(p.oid) || ';' from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('get_occupation_overview','_occ_try_start');
SQL
echo "backup /root/backups/ocupa2_pre_$TS.sql $(wc -c < /root/backups/ocupa2_pre_$TS.sql)"
docker cp /tmp/ocupa2.sql xnova-database:/tmp/ocupa2.sql
docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 -f /tmp/ocupa2.sql
docker exec -i -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -At <<'SQL'
\echo '=== grants ==='
select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE'), has_function_privilege('authenticated', p.oid, 'EXECUTE') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('get_system_occupations','get_occupation_overview','_occ_try_start');
\echo '=== msg text ==='
select position('menú Ocupaciones' in pg_get_functiondef(p.oid)) > 0 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='_occ_try_start';
\echo '=== active occupations ==='
select o.id, p.galaxy, p.solar_system, p.position, o.owner_id, o.occupier_id from occupations o join planets p on p.id=o.planet_id where o.status='active';
BEGIN;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT o.*, p.galaxy, p.solar_system FROM occupations o JOIN planets p ON p.id=o.planet_id WHERE o.status='active' LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.occupier_id::text, 'role','authenticated')::text, true);
    RAISE NOTICE 'occupier sys: %', get_system_occupations(r.galaxy, r.solar_system);
    RAISE NOTICE 'occupier ov: %', get_occupation_overview()->'as_occupier';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.owner_id::text, 'role','authenticated')::text, true);
    RAISE NOTICE 'owner sys: %', get_system_occupations(r.galaxy, r.solar_system);
    RAISE NOTICE 'owner ov: %', get_occupation_overview()->'as_owner';
  END LOOP;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RAISE NOTICE 'anon: %', get_system_occupations(2, 271);
END $$;
ROLLBACK;
SQL
