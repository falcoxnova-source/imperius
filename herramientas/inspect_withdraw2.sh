#!/bin/bash
echo "=== complete_withdrawal body ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='complete_withdrawal' LIMIT 1;" -t -A | head -60

echo
echo "=== fail_withdrawal body ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='fail_withdrawal' LIMIT 1;" -t -A | head -60

echo
echo "=== Last 5 withdrawal transactions ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT id, tx_type, amount, fxu_amount, status, error_message, created_at FROM wallet_transactions WHERE tx_type='withdrawal' ORDER BY created_at DESC LIMIT 5;"

echo
echo "=== Test SET LOCAL auth approach ==="
docker exec xnova-database psql -U postgres -d postgres -c "
BEGIN;
SET LOCAL request.jwt.claim.sub TO '00000000-0000-0000-0000-000000000000';
SELECT auth.uid();
COMMIT;"
