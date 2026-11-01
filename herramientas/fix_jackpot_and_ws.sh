#!/bin/sh
echo "=== Check jackpot_pools table properly ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT table_schema, table_name FROM information_schema.tables WHERE table_name = 'jackpot_pools'" 2>&1

echo ""
echo "=== Try with public schema ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT * FROM public.jackpot_pools" 2>&1

echo ""
echo "=== Check table structure via PostgREST ==="
curl -sk -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ' \
  'https://127.0.0.1/rest/v1/jackpot_pools?select=*&limit=1' 2>&1 | head -c 500

echo ""
echo ""
echo "=== If no rows, insert one ==="
INSERT_RESULT=$(docker exec xnova-database psql -U postgres -d postgres -c "
DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jackpot_pools') THEN
    IF NOT EXISTS (SELECT 1 FROM public.jackpot_pools WHERE id = 1) THEN
      INSERT INTO public.jackpot_pools (id) VALUES (1);
      RAISE NOTICE 'Row inserted';
    ELSE
      RAISE NOTICE 'Row already exists';
    END IF;
  ELSE
    RAISE NOTICE 'Table does not exist';
  END IF;
END
\$\$;
" 2>&1)
echo "$INSERT_RESULT"

echo ""
echo "=== Verify fix ==="
curl -sk -w "\nHTTP %{http_code}\n" \
  -H 'Accept: application/vnd.pgrst.object+json' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ' \
  'https://127.0.0.1/rest/v1/jackpot_pools?select=*&id=eq.1' 2>&1 | head -c 300

echo ""
echo ""
echo "=== Fix nginx realtime (hard restart) ==="
docker restart xnova-kong 2>&1
echo "Nginx restarted"

echo ""
echo "=== Test WebSocket after restart ==="
sleep 2
curl -sk -w "\nHTTP %{http_code}\n" 'https://127.0.0.1/realtime/v1/websocket' 2>&1
