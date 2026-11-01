#!/bin/bash
set -e
docker exec xnova-database psql -U postgres -d postgres -At -c "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='process_fleet_arrival'" > /tmp/current_pfa.sql
echo "Lines: $(wc -l < /tmp/current_pfa.sql)"
echo "MD5: $(md5sum /tmp/current_pfa.sql)"
echo "--- FORTRESS BLOCK in current prod ---"
grep -nE 'FORTRESS|fortress_result_text|won_no_claim|VICTORIA ATACANTE|VICTORIA DEFENSOR' /tmp/current_pfa.sql | head -30
