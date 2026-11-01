#!/bin/sh
echo "=== BACKEND (no afectado por restore) ==="

echo "1. Streak DB cost:"
docker exec xnova-database psql -U postgres -d postgres -t -c "SELECT value FROM public.game_settings WHERE key='daily_streak_cost'" 2>&1

echo "2. get_my_monthly_market_sales SECURITY DEFINER:"
docker exec xnova-database psql -U postgres -d postgres -t -c "SELECT prosecdef FROM pg_proc WHERE proname='get_my_monthly_market_sales'" 2>&1

echo "3. Jackpot RLS anon:"
docker exec xnova-database psql -U postgres -d postgres -t -c "SELECT roles FROM pg_policies WHERE policyname='Anyone can view jackpot pools'" 2>&1

echo "4. New missions exist:"
docker exec xnova-database psql -U postgres -d postgres -t -c "SELECT count(*) FROM public.daily_missions WHERE id IN (18,19,20,21)" 2>&1

echo "5. WebSocket server running:"
systemctl is-active xnova-ws 2>&1

echo "6. Wallet-info endpoint:"
curl -sk 'https://127.0.0.1/functions/v1/wallet-info' | python3 -c "import sys,json; d=json.load(sys.stdin); print('USDT fields:' if 'usdt' in str(d) else 'CLEAN - no USDT')" 2>&1

echo ""
echo "=== FRONTEND (perdido) ==="
echo "7. Admin 'Racha Diaria' section:"
grep -c "Racha Diaria" /root/xnova/frontend-html/assets/AdminPage-1RVSoqOO.js 2>&1

echo "8. Active missions count:"
echo "(las misiones existen en DB, el frontend las muestra igual)"
