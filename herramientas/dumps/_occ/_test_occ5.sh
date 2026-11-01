#!/bin/bash
cat > /tmp/o5test2.sql <<'EOF'
BEGIN;
SELECT f.id AS fid, f.user_id AS uid FROM public.fleets f
WHERE NOT f.is_returning AND NOT f.is_completed AND EXISTS (SELECT 1 FROM public.fleet_ships fs WHERE fs.fleet_id=f.id AND fs.quantity>0)
ORDER BY f.departure_time DESC LIMIT 1 \gset
SELECT id, mission_type, origin_planet_id, target_galaxy||':'||target_system||':'||target_position AS tgt, arrival_time - departure_time AS ida FROM public.fleets WHERE id = :'fid';
SELECT p.galaxy||':'||p.solar_system||':'||p.position AS origin FROM public.planets p JOIN public.fleets f ON f.origin_planet_id=p.id WHERE f.id=:'fid';
SELECT public._occ_send_garrison_home(:'fid') - now() AS vuelo_calc;
SELECT is_returning, origin_planet_id, return_time - now() AS vuelo FROM public.fleets WHERE id = :'fid';
SELECT set_config('request.jwt.claims', json_build_object('sub', :'uid', 'role','authenticated')::text, true);
SELECT public.get_occupation_ship_info()->>'unit_price_usd' AS usd, public.get_occupation_ship_info()->>'unit_cost_tung' AS tung, public.get_occupation_ship_info()->>'tung_price_usd' AS tungpx;
ROLLBACK;
EOF
docker cp /tmp/o5test2.sql xnova-database:/tmp/o5test2.sql
docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/o5test2.sql || echo "TEST FAILED (rolled back)"
