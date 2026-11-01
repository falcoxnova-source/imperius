#!/bin/bash
Q() { docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -At -c "$1"; }
echo "== fleets notnull no default"
Q "select column_name||' '||data_type from information_schema.columns where table_schema='public' and table_name='fleets' and is_nullable='NO' and column_default is null"
echo "== fleets all cols"
Q "select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='fleets'"
echo "== ship codes"
Q "select id||' '||code||' '||weapon_power from ship_types order by weapon_power desc limit 5"
echo "== pfa head"
Q "select n||': '||left(l,200) from pg_proc p, regexp_split_to_table(p.prosrc, E'\n') with ordinality t(l,n) where p.oid='public.process_fleet_arrival(uuid)'::regprocedure and n < 60 and l ~* 'select|if|return'"
