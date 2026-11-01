#!/bin/sh
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ"
SERV="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3MDQwNjcyMDAsImV4cCI6MTg2MTgzMzYwMH0.eQGKSemxSS7_PquGBccdZfoasuB5kd333QK65g7IQp0"
sed -i "s|\${SUPABASE_ANON_KEY}|${ANON}|g" /var/lib/kong/kong.yml
sed -i "s|\${SUPABASE_SERVICE_ROLE_KEY}|${SERV}|g" /var/lib/kong/kong.yml
kong reload
