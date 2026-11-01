#!/bin/bash
Q() { docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -At -c "$1"; }
L() { Q "select n||': '||l from pg_proc p, regexp_split_to_table(p.prosrc, E'\n') with ordinality t(l,n) where p.oid='$1'::regprocedure and l ~* '$2'"; }
echo "== perform_combat deploy/source"
L "public.perform_combat(uuid,uuid)" "deploy|'source'|OCUPA|occ"
echo "== pfa attack branch: source/deploy/occ"
L "public.process_fleet_arrival(uuid)" "source|OCUPA|_occ|defender_remaining"
echo "== get_incoming_attacks"
Q "select p.oid::regprocedure from pg_proc p where proname='get_incoming_attacks'"
Q "select n||': '||l from pg_proc p, regexp_split_to_table(p.prosrc, E'\n') with ordinality t(l,n) where p.proname='get_incoming_attacks' and l ~* 'occup|FROM|WHERE|user_id'"
echo "== fleet_warning senders"
Q "select p.oid::regprocedure from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.prosrc like '%fleet_warning%'"
echo "== secure_send_fleet warning lines"
Q "select n||': '||l from pg_proc p, regexp_split_to_table(p.prosrc, E'\n') with ordinality t(l,n) where p.proname='secure_send_fleet' and l ~* 'fleet_warning|recipient|occ'"
echo "== active occupations"
Q "select count(*) from occupations where status='active'"
