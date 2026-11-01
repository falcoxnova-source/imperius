#!/bin/sh
echo "=== 1. Check jackpot_pools table ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT * FROM jackpot_pools" 2>&1

echo ""
echo "=== 2. Check 406 error cause: test with single-object Accept header ==="
# Simulate what the Supabase client sends
curl -sk -w "\nHTTP %{http_code}\n" \
  -H 'Accept: application/vnd.pgrst.object+json' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ' \
  'https://127.0.0.1/rest/v1/jackpot_pools?select=*&id=eq.1' 2>&1

echo ""
echo "=== 3. Fix: insert default row if missing ==="
docker exec xnova-database psql -U postgres -d postgres -c "
INSERT INTO jackpot_pools (id, expedition_pool, top50_pool, plus_pool, social_pool, fortress_pool, destruction_pool)
SELECT 1, 0, 0, 0, 0, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM jackpot_pools WHERE id = 1);
" 2>&1

echo ""
echo "=== 4. Verify fix ==="
curl -sk -w "\nHTTP %{http_code}\n" \
  -H 'Accept: application/vnd.pgrst.object+json' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE4NjE4MzM2MDB9.Z6LpsYFjkkPVAuHXezcReNUZD4xv9COS21OkbQ_3nHQ' \
  'https://127.0.0.1/rest/v1/jackpot_pools?select=*&id=eq.1' 2>&1 | head -c 300

echo ""
echo "======"
echo "=== 5. Fix WebSocket: return 426 Upgrade Required ==="
cp /root/xnova/nginx/default-local.conf /root/xnova/nginx/default-local.conf.bak4

python3 -c "
with open('/root/xnova/nginx/default-local.conf', 'r') as f:
    content = f.read()

old = '''    # Realtime WebSocket - not available, return clean 204
    location /realtime/v1/ {
        access_log off;
        return 204;
    }'''

new = '''    # Realtime WebSocket - not available, reject cleanly with 426
    location /realtime/v1/ {
        access_log off;
        return 426 '{\"error\":\"realtime not available\"}';
        add_header Content-Type application/json;
    }'''

if old in content:
    content = content.replace(old, new)
    with open('/root/xnova/nginx/default-local.conf', 'w') as f:
        f.write(content)
    print('Replaced successfully')
else:
    # Try to find the realtime block
    import re
    match = re.search(r'location /realtime/v1/ \{.*?\}', content, re.DOTALL)
    if match:
        print('Found block:')
        print(match.group())
        content = content.replace(match.group(), '''    location /realtime/v1/ {
        access_log off;
        return 426 '{\"error\":\"realtime not available\"}';
        add_header Content-Type application/json;
    }''')
        with open('/root/xnova/nginx/default-local.conf', 'w') as f:
            f.write(content)
        print('Replaced via regex')
    else:
        print('Could not find realtime block')
"

echo ""
echo "=== 6. Verify nginx config ==="
grep -A 6 'realtime/v1' /root/xnova/nginx/default-local.conf

echo ""
echo "=== 7. Test nginx config ==="
docker exec xnova-kong nginx -t 2>&1

echo ""
echo "=== 8. Reload nginx ==="
docker exec xnova-kong nginx -s reload 2>&1
echo "Reloaded"

echo ""
echo "=== 9. Test WebSocket rejection ==="
curl -sk -w "\nHTTP %{http_code}\n" 'https://127.0.0.1/realtime/v1/websocket' 2>&1
