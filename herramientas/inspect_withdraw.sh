#!/bin/bash
echo "=== Function signatures ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS result
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('request_withdrawal','request_withdrawal_usdt','complete_withdrawal','fail_withdrawal','fail_withdrawal_usdt','confirm_deposit')
ORDER BY p.proname;"

echo
echo "=== request_withdrawal body (look for auth.uid() usage) ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='request_withdrawal' LIMIT 1;" -t -A | head -80

echo
echo "=== wallet_config table ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='wallet_config';
SELECT * FROM public.wallet_config LIMIT 5;"

echo
echo "=== wallet_transactions columns ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='wallet_transactions' ORDER BY ordinal_position;"
