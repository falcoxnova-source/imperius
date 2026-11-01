#!/bin/sh
# Test get_my_monthly_market_sales via nginx on VPS

echo "=== Login via nginx ==="
LOGIN_RESP=$(curl -sk -X POST 'https://127.0.0.1/auth/v1/token?grant_type=password' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ' \
  -H 'Content-Type: application/json' \
  -d '{"email":"falcoxcorp@gmail.com","password":"Jfs.samsung1989"}' 2>&1)

echo "Login response:"
echo "$LOGIN_RESP" | head -c 500

ACCESS_TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -n "$ACCESS_TOKEN" ]; then
  echo ""
  echo "=== Call get_my_monthly_market_sales ==="
  RPC_RESP=$(curl -sk -X POST 'https://127.0.0.1/rest/v1/rpc/get_my_monthly_market_sales' \
    -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H 'Content-Type: application/json' 2>&1)
  
  echo "RPC response:"
  echo "$RPC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({k:d[k] for k in ['success','monthly_limit_enabled','vip_unlimited'] if k in d}, indent=2))" 2>/dev/null
  echo "Full:"
  echo "$RPC_RESP" | head -c 500
else
  echo "Login failed. Full response:"
  echo "$LOGIN_RESP"
fi
