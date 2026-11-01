sed -n 470,560p /tmp/src_bot_ai_tick.txt
echo ===== 
grep -n 'EXCEPTION' /tmp/src_bot_ai_tick.txt | head -40
echo =====
grep -n 'INSERT INTO shipyard_queue' /tmp/src_bot_ai_tick.txt
