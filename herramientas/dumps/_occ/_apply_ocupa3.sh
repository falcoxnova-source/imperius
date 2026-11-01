#!/bin/bash
set -e
sed -i 's/\r$//' /tmp/ocupa3.sql
docker cp /tmp/ocupa3.sql xnova-database:/tmp/ocupa3.sql
docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 -f /tmp/ocupa3.sql
docker exec -i -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -At <<'SQL'
\echo '=== grants ==='
select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE'), has_function_privilege('authenticated', p.oid, 'EXECUTE') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='get_occupation_planet_view';
BEGIN;
DO $$
DECLARE r record; v jsonb;
BEGIN
  FOR r IN SELECT * FROM occupations WHERE status='active' LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.occupier_id::text, 'role','authenticated')::text, true);
    v := get_occupation_planet_view(r.id);
    RAISE NOTICE 'occupier: planet=% storage=% nb=% defs=%', v->'planet', v->'storage', jsonb_array_length(v->'buildings'), v->'defenses';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.owner_id::text, 'role','authenticated')::text, true);
    BEGIN
      v := get_occupation_planet_view(r.id);
      RAISE NOTICE 'OWNER LEAK!';
    EXCEPTION WHEN others THEN RAISE NOTICE 'owner blocked: %', SQLERRM;
    END;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '{}', true);
  BEGIN
    v := get_occupation_planet_view('0631a0dc-92d8-4abf-b540-1f0d440d6a58');
    RAISE NOTICE 'ANON LEAK!';
  EXCEPTION WHEN others THEN RAISE NOTICE 'anon blocked: %', SQLERRM;
  END;
END $$;
ROLLBACK;
SQL
