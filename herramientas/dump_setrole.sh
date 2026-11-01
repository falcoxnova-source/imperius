#!/bin/bash
docker exec xnova-database psql -U postgres -d postgres -t -A \
  -c "SELECT pg_get_functiondef('public.set_planet_autopilot_role(uuid,text)'::regprocedure);"
echo "===CONSTRAINT==="
docker exec xnova-database psql -U postgres -d postgres -t -A \
  -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='planets_autopilot_role_check';"
echo "===GRANTS==="
docker exec xnova-database psql -U postgres -d postgres -t -A \
  -c "SELECT grantee, privilege_type FROM information_schema.role_routine_grants WHERE routine_name='set_planet_autopilot_role';"
