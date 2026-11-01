#!/bin/bash
Q() { docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -At -c "$1"; }
Q "select n||': '||l from pg_proc p, regexp_split_to_table(p.prosrc, E'\n') with ordinality t(l,n) where p.oid='public.perform_combat(uuid,uuid)'::regprocedure and n between 40 and 185"
echo "== triggers on fleets with garrison/occ"
Q "select tgname, tgfoid::regproc, tgenabled from pg_trigger where tgrelid='public.fleets'::regclass and not tgisinternal order by 1"
echo "== frontend incoming source"
