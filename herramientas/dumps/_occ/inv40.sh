#!/bin/bash
docker exec -i -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -At <<'SQL'
\echo '=== ship 24 ==='
select id, code, name from ship_types where id=24 or code='occupation_ship';
\echo '=== admin fns ==='
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('admin_get_planet_inventory','admin_set_planet_ship');
\echo '=== src admin_get_planet_inventory ==='
select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_get_planet_inventory';
\echo '=== src admin_set_planet_ship ==='
select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_set_planet_ship';
\echo '=== grants ==='
select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('admin_get_planet_inventory','admin_set_planet_ship','occupation_abandon');
\echo '=== src occupation_abandon ==='
select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='occupation_abandon';
SQL
