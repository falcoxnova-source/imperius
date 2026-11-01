#!/bin/bash
# Reparto pool de Fortalezas con reintentos ante deadlock.
# La funcion tiene guard diario (una vez por CURRENT_DATE), asi que reintentar es seguro.
LOG=/root/xnova/logs/fortress_pool.log
mkdir -p /root/xnova/logs

for i in 1 2 3 4 5; do
  OUT=$(docker exec xnova-database psql -U postgres -d postgres -tAc "SELECT public.admin_distribute_fortress_pool()::text;" 2>&1)
  RC=$?
  echo "$(date -u '+%Y-%m-%d %H:%M:%S') intento=$i rc=$RC out=$OUT" >> "$LOG"

  if [ $RC -eq 0 ] && echo "$OUT" | grep -q '"success": true'; then
    exit 0
  fi
  # Ya repartido hoy -> no reintentar
  if echo "$OUT" | grep -qi 'Ya se distribuyo'; then
    exit 0
  fi
  sleep 20
done

echo "$(date -u '+%Y-%m-%d %H:%M:%S') FALLO TRAS 5 INTENTOS" >> "$LOG"
exit 1
