#!/bin/bash
set -e
TS=$(date +%s)
echo "=== Backup current function ==="
docker exec xnova-database psql -U postgres -d postgres -At -c "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='process_fleet_arrival'" > /tmp/pfa_backup_${TS}.sql
echo "Backup saved to /tmp/pfa_backup_${TS}.sql ($(wc -l < /tmp/pfa_backup_${TS}.sql) lines)"

echo
echo "=== Apply new function ==="
docker cp /tmp/_fortress_full.sql xnova-database:/tmp/_fortress_full.sql
docker exec xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/_fortress_full.sql

echo
echo "=== Verify new function deployed ==="
docker exec xnova-database psql -U postgres -d postgres -At -c "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='process_fleet_arrival'" > /tmp/pfa_new.sql
echo "New function: $(wc -l < /tmp/pfa_new.sql) lines"

echo
echo "=== Verify fix in fortress block ==="
grep -nE "won_no_claim|v_fortress_def_result_text|v_fortress_def_msg|DERROTA PARCIAL" /tmp/pfa_new.sql | head -15
