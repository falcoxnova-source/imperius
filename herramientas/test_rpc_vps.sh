#!/bin/sh
echo "=== Test get_my_monthly_market_sales via curl ==="
# Get a valid JWT token first
echo "Getting auth token..."
TOKEN=$(curl -s -X POST 'http://127.0.0.1:9998/auth/v1/token?grant_type=password' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ' \
  -H 'Content-Type: application/json' \
  -d '{"email":"falcoxcorp@gmail.com","password":"Jfs.samsung1989"}' 2>&1)
echo "Token response: $TOKEN" | head -c 500

ACCESS_TOKEN=$(echo "$TOKEN" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
echo ""
echo "Access token length: ${#ACCESS_TOKEN}"

if [ -n "$ACCESS_TOKEN" ]; then
  echo ""
  echo "=== Calling get_my_monthly_market_sales ==="
  curl -s -X POST 'http://127.0.0.1:9997/rpc/get_my_monthly_market_sales' \
    -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H 'Content-Type: application/json' 2>&1
fi
