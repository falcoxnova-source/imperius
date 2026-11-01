#!/bin/sh
echo "=== Check auth endpoint ==="
curl -v -X POST 'http://127.0.0.1:9998/auth/v1/token?grant_type=password' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ' \
  -H 'Content-Type: application/json' \
  -d '{"email":"falcoxcorp@gmail.com","password":"Jfs.samsung1989"}' 2>&1 | head -50

echo ""
echo "=== Check nginx config for auth ==="
docker exec xnova-kong cat /etc/nginx/conf.d/default.conf 2>&1 | head -100
