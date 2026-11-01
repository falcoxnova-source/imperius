#!/bin/bash
echo "=== Locate tables ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT table_schema, table_name FROM information_schema.tables WHERE table_name IN ('alliance_fortresses','fortress_ships','battle_reports') ORDER BY table_schema, table_name;"

echo
echo "=== Search path ==="
docker exec xnova-database psql -U postgres -d postgres -c "SHOW search_path;"

echo
echo "=== Try public.alliance_fortresses ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT count(*) FROM public.alliance_fortresses;"
