#!/bin/bash
set -e
TS=$(date +%Y%m%d_%H%M%S)
mkdir -p /root/backups
sed -i 's/\r$//' /tmp/ocupa6.sql
docker exec xnova-database pg_dump -U postgres -d postgres --schema-only -n public > /root/backups/ocupa6_pre_$TS.sql
echo "backup /root/backups/ocupa6_pre_$TS.sql"
docker cp /tmp/ocupa6.sql xnova-database:/tmp/ocupa6.sql
docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 -f /tmp/ocupa6.sql
docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -At -c "select p.oid::regprocedure, has_function_privilege('anon',p.oid,'execute'), has_function_privilege('authenticated',p.oid,'execute'), position('[OCUPA6]' in p.prosrc)>0 from pg_proc p where proname='_occ_try_start'"
