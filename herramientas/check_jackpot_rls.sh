#!/bin/sh
echo "=== Check RLS on jackpot_pools ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'jackpot_pools'
" 2>&1

echo ""
echo "=== Check policies ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'jackpot_pools'
" 2>&1

echo ""
echo "=== Check grants ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public' AND table_name = 'jackpot_pools'
" 2>&1

echo ""
echo "=== Try as postgres via REST (with service_role key) ==="
# We need the service_role key - let's get it from the GoTrue config
echo "Check GoTrue config..."
grep -r "service_role\|SERVICE_ROLE" /root/xnova/ 2>/dev/null | head -5
