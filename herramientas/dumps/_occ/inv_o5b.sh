#!/bin/bash
Q() { docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -At -c "$1"; }
Q "select p.proname||' :: '||l from pg_proc p join pg_namespace n on n.oid=p.pronamespace, regexp_split_to_table(p.prosrc, E'\n') l where n.nspname='public' and (p.proname like '%occ%') and (l ilike '%consum%' or l ilike '%USD%')"
Q "select description from ship_types where code='occupation_ship'"
Q "select p.oid::regprocedure from pg_proc p where proname in ('occupation_transport','purchase_occupation_ship','_occ_send_garrison_home','occupation_abandon')"
Q "select l from pg_proc p, regexp_split_to_table(p.prosrc, E'\n') l where p.proname='occupation_transport' and l like '%IF v_sent = 0 THEN%'"
Q "select l from pg_proc p, regexp_split_to_table(p.prosrc, E'\n') l where p.proname='_occ_end' and (l like '%_occ_process_builds(o.id)%' or l like '%ha recuperado su planeta%')"
Q "select l from pg_proc p, regexp_split_to_table(p.prosrc, E'\n') l where p.proname='process_acs_fleet_arrival' and (l like '%fleet_ships%')"
