#!/bin/bash
# Audit fortress system on production VPS

PSQL="docker exec xnova-database psql -U postgres -d postgres"

echo "=== 1. fortress_ships schema ==="
$PSQL -c "SET search_path TO public; \d public.fortress_ships"

echo
echo "=== 2. alliance_fortresses schema ==="
$PSQL -c "SET search_path TO public; \d public.alliance_fortresses"

echo
echo "=== 3. Current fortresses with owners ==="
$PSQL -c "SELECT af.galaxy, af.owner_alliance_id, a.name AS owner, af.captured_at, (SELECT COALESCE(SUM(quantity),0) FROM public.fortress_ships fs WHERE fs.fortress_id=af.id) AS total_ships FROM public.alliance_fortresses af LEFT JOIN public.alliances a ON a.id=af.owner_alliance_id ORDER BY af.galaxy;"

echo
echo "=== 4. ORPHAN ships check (ships whose alliance_id mismatches fortress owner) ==="
$PSQL -c "SELECT fs.fortress_id, af.owner_alliance_id AS fortress_owner, fs.alliance_id AS ship_alliance, COUNT(*) AS rows, SUM(fs.quantity) AS total_qty FROM public.fortress_ships fs JOIN public.alliance_fortresses af ON af.id=fs.fortress_id WHERE fs.alliance_id IS DISTINCT FROM af.owner_alliance_id GROUP BY fs.fortress_id, af.owner_alliance_id, fs.alliance_id;"

echo
echo "=== 5. Ship rows by fortress (detailed) ==="
$PSQL -c "SELECT af.galaxy, a.name AS owner, fs.alliance_id AS ship_alliance, p.username AS contributor, st.name AS ship, fs.quantity FROM public.fortress_ships fs JOIN public.alliance_fortresses af ON af.id=fs.fortress_id LEFT JOIN public.alliances a ON a.id=af.owner_alliance_id LEFT JOIN public.profiles p ON p.id=fs.user_id LEFT JOIN public.ship_types st ON st.id=fs.ship_type_id ORDER BY af.galaxy, fs.alliance_id, p.username;"

echo
echo "=== 6. Last 10 fortress battle reports ==="
$PSQL -c "SELECT br.created_at, br.result, br.coordinates, p_att.username AS attacker, a_att.name AS att_alliance, a_def.name AS def_alliance FROM public.battle_reports br LEFT JOIN public.profiles p_att ON p_att.id=br.attacker_id LEFT JOIN public.alliance_members am_a ON am_a.user_id=br.attacker_id LEFT JOIN public.alliances a_att ON a_att.id=am_a.alliance_id LEFT JOIN public.alliance_members am_d ON am_d.user_id=br.defender_id LEFT JOIN public.alliances a_def ON a_def.id=am_d.alliance_id WHERE br.battle_type='fortress' ORDER BY br.created_at DESC LIMIT 10;"

echo
echo "=== 7. fortress_ships unique constraints (must allow multi-contributor) ==="
$PSQL -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.fortress_ships'::regclass;"
