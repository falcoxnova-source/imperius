#!/bin/bash
Q() { docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -At -c "$1"; }
echo "== funcs referencing occupations with 3"
Q "select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosrc ilike '%occupations%' and (p.prosrc ~ '>=\s*3' or p.prosrc ilike '%max_active%' or p.prosrc ilike '%ximo de 3%')"
echo "== lines"
Q "select p.proname || ' :: ' || l from pg_proc p join pg_namespace n on n.oid=p.pronamespace, regexp_split_to_table(p.prosrc, E'\n') l where n.nspname='public' and p.prosrc ilike '%occupations%' and (l ~ '>=\s*3' or l ilike '%max_active%' or l ilike '%ximo de 3%' or l ilike '%occupier_id = f.user_id%')"
echo "== ship desc"
Q "select description from ship_types where code='occupation_ship'"
echo "== calc resources occupation refs"
Q "select p.oid::regprocedure || ' occ=' || (p.prosrc ilike '%occupation%')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('calculate_planet_resources','update_planet_resources','sync_planet_resources','get_occupation_detail')"
echo "== get_occupation_detail resource lines"
Q "select l from pg_proc p, regexp_split_to_table(p.prosrc, E'\n') l where p.proname='get_occupation_detail' and (l ilike '%planet_resources%' or l ilike '%per_hour%' or l ilike '%calculate%' or l ilike '%update_planet%')"
echo "== calc_planet_resources occupation lines"
Q "select p.proname||' :: '||l from pg_proc p, regexp_split_to_table(p.prosrc, E'\n') l where p.proname in ('calculate_planet_resources','update_planet_resources') and l ilike '%occup%'"
