#!/bin/bash
Q() { docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -At -c "$1"; }
echo "== occupations cols"
Q "select column_name||' '||data_type from information_schema.columns where table_schema='public' and table_name='occupations' order by ordinal_position"
echo "== _occ_end"
Q "select prosrc from pg_proc where proname='_occ_end'"
echo "== occ stats"
Q "select status, end_reason, count(*) from occupations group by 1,2" 2>&1
