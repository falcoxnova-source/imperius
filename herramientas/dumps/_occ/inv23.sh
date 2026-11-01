grep -n -i 'FOR v_planet IN\|FROM planets' /tmp/src_bot_ai_tick.txt | head -40
echo ====
grep -n -i -A6 'FOR v_planet IN' /tmp/src_bot_ai_tick.txt | head -80
echo ==== autopilot col
docker exec -i xnova-database psql -U postgres -d postgres -At -c "select column_name from information_schema.columns where table_name='planets' and column_name ilike '%auto%'" < /dev/null
docker exec -i xnova-database psql -U postgres -d postgres -At -c "select prosrc from pg_proc where proname='set_planet_autopilot_enabled'" < /dev/null
