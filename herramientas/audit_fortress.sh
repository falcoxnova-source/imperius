#!/bin/bash
# Audit fortress system on production VPS

echo "=== 1. fortress_ships TABLE schema ==="
docker exec xnova-database psql -U postgres -d postgres -c "\d fortress_ships"

echo
echo "=== 2. alliance_fortresses TABLE schema ==="
docker exec xnova-database psql -U postgres -d postgres -c "\d alliance_fortresses"

echo
echo "=== 3. Current state of fortresses ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT af.galaxy, af.owner_alliance_id, a.name AS owner, af.captured_at, (SELECT SUM(quantity) FROM fortress_ships fs WHERE fs.fortress_id=af.id) AS total_ships FROM alliance_fortresses af LEFT JOIN alliances a ON a.id=af.owner_alliance_id ORDER BY af.galaxy;"

echo
echo "=== 4. Verify NO orphan ships (ships whose alliance_id != fortress owner) ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT fs.fortress_id, af.owner_alliance_id AS fortress_owner, fs.alliance_id AS ship_owner, COUNT(*) AS ship_rows, SUM(fs.quantity) AS total_qty FROM fortress_ships fs JOIN alliance_fortresses af ON af.id=fs.fortress_id WHERE fs.alliance_id IS DISTINCT FROM af.owner_alliance_id GROUP BY fs.fortress_id, af.owner_alliance_id, fs.alliance_id;"

echo
echo "=== 5. Check capture logic in resolve_fortress_attack ==="
docker exec xnova-database psql -U postgres -d postgres -At -c "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='resolve_fortress_attack'" > /tmp/rfa.sql
echo "Total lines: $(wc -l < /tmp/rfa.sql)"
echo "--- DELETE / UPDATE owner_alliance_id sections ---"
grep -nE "DELETE FROM fortress_ships|UPDATE alliance_fortresses|INSERT INTO fortress_ships|v_can_claim" /tmp/rfa.sql

echo
echo "=== 6. Check trigger / overlapping process_fleet_arrival fortress block correctness ==="
docker exec xnova-database psql -U postgres -d postgres -At -c "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='process_fleet_arrival'" > /tmp/pfa.sql
grep -nE "fortress_ships|owner_alliance_id" /tmp/pfa.sql | head -20

echo
echo "=== 7. Last 10 fortress battle reports ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT br.id, br.created_at, br.result, br.coordinates, p_att.username AS attacker, p_def.username AS defender FROM battle_reports br LEFT JOIN profiles p_att ON p_att.id=br.attacker_id LEFT JOIN profiles p_def ON p_def.id=br.defender_id WHERE br.battle_type='fortress' ORDER BY br.created_at DESC LIMIT 10;"
