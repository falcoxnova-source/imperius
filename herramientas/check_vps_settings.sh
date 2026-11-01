#!/bin/bash
docker exec xnova-database psql -U postgres -d postgres -c "SELECT key, value FROM public.game_settings WHERE key LIKE '%market%' OR key LIKE '%limit%' OR key LIKE '%vip%' OR key LIKE '%sell%' OR key LIKE '%trade%' ORDER BY key;"
echo "---ALL SETTINGS---"
docker exec xnova-database psql -U postgres -d postgres -c "SELECT key, value FROM public.game_settings ORDER BY key;"
