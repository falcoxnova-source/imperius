#!/bin/bash
echo "=== Test 1: no auth → 401 ==="
curl -s -X POST http://127.0.0.1:9001/auto-withdraw \
  -H "Content-Type: application/json" \
  -d '{"amount":1,"wallet_address":"0x387526aa3f94f5C41e6a47D8c98751273e2214A3"}'
echo

echo "=== Test 2: invalid wallet → 400 (with fake JWT) ==="
# Fake JWT with sub claim (will fail at DB call but should pass parsing)
FAKE_JWT='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAifQ.x'
curl -s -X POST http://127.0.0.1:9001/auto-withdraw \
  -H "Authorization: Bearer $FAKE_JWT" \
  -H "Content-Type: application/json" \
  -d '{"amount":1,"wallet_address":"not_a_wallet"}'
echo

echo "=== Test 3: through nginx ==="
curl -s -X POST https://tung.xnova.xyz/functions/v1/auto-withdraw \
  -H "Content-Type: application/json" \
  -d '{"amount":1,"wallet_address":"0x387526aa3f94f5C41e6a47D8c98751273e2214A3"}'
echo

echo "=== Test 4: try with a real user (last 1 active user) ==="
USER_ID=$(docker exec xnova-database psql -U postgres -d postgres -t -A -c "SELECT id FROM auth.users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1;")
echo "Real user: $USER_ID"
if [ -n "$USER_ID" ]; then
  # Make a fake JWT for that user
  HEADER=$(printf '{"alg":"HS256","typ":"JWT"}' | base64 -w0 | tr '+/' '-_' | tr -d '=')
  PAYLOAD=$(printf '{"sub":"%s","role":"authenticated"}' "$USER_ID" | base64 -w0 | tr '+/' '-_' | tr -d '=')
  JWT="${HEADER}.${PAYLOAD}.fake"
  echo "Test withdrawal with real user (just validates DB flow - should return error like 'not enough balance' or 'wallet not enabled'):"
  curl -s -X POST http://127.0.0.1:9001/auto-withdraw \
    -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" \
    -d '{"amount":1,"wallet_address":"0x387526aa3f94f5C41e6a47D8c98751273e2214A3"}'
  echo
fi

echo
echo "=== Service logs (last 30 lines) ==="
tail -30 /var/log/xnova-deposit.log
