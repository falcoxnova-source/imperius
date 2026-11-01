#!/bin/bash
docker exec -i -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -At <<'SQL'
\echo '=== triggers planet_ships ==='
select tgname, pg_get_triggerdef(t.oid) from pg_trigger t where tgrelid='public.planet_ships'::regclass and not tgisinternal;
BEGIN;
DO $$
DECLARE v_admin uuid; v_planet uuid; r jsonb; inv jsonb;
BEGIN
  SELECT id INTO v_admin FROM profiles WHERE is_admin = true LIMIT 1;
  SELECT id INTO v_planet FROM planets WHERE planet_type='planet' AND NOT is_main_planet AND user_id <> v_admin LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  inv := admin_get_planet_inventory(v_planet);
  RAISE NOTICE 'inv has 24: %', (SELECT count(*) FROM jsonb_array_elements(inv->'ships') e WHERE (e->>'ship_type_id')::int = 24);
  r := admin_set_planet_ship(v_planet, 24, 3);
  RAISE NOTICE 'set: %', r;
  RAISE NOTICE 'qty now: %', (SELECT quantity FROM planet_ships WHERE planet_id = v_planet AND ship_type_id = 24);
END $$;
ROLLBACK;
SQL
