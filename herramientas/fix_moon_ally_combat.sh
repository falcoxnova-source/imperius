#!/bin/bash
set -e
sed -i 's/\r$//' /tmp/fix_moon_ally_combat.sql
docker cp /tmp/fix_moon_ally_combat.sql xnova-database:/tmp/fix_moon_ally_combat.sql
echo "=== Aplicando migracion ==="
docker exec xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/fix_moon_ally_combat.sql

echo ""
echo "=== VERIFICACION ==="
echo "--- perform_combat: filtro por cuerpo presente? ---"
docker exec xnova-database psql -U postgres -d postgres -At -c "SELECT position('AND COALESCE(f.target_type' IN pg_get_functiondef('public.perform_combat(uuid,uuid)'::regprocedure)) > 0;"
echo "--- process_fleet_arrival: despacho por source presente? ---"
docker exec xnova-database psql -U postgres -d postgres -At -c "SELECT position('ELSIF (v_unit->>''source'') NOT IN (''planet'',''defense'')' IN pg_get_functiondef('public.process_fleet_arrival(uuid)'::regprocedure)) > 0;"
echo "--- process_fleet_arrival: resolucion objetivo por planet_type presente? ---"
docker exec xnova-database psql -U postgres -d postgres -At -c "SELECT position('AND p.planet_type = COALESCE(fleet_record.target_type' IN pg_get_functiondef('public.process_fleet_arrival(uuid)'::regprocedure)) > 0;"
echo "--- process_fleet_arrival: limpieza de flotas estacionadas presente? ---"
docker exec xnova-database psql -U postgres -d postgres -At -c "SELECT (position('DELETE FROM fleet_ships WHERE quantity <= 0 AND fleet_id IN' IN pg_get_functiondef('public.process_fleet_arrival(uuid)'::regprocedure)) > 0);"
echo "=== LISTO ==="
