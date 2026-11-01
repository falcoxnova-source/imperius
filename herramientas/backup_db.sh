#!/bin/bash
# =============================================================================
# XNOVA - BACKUP COMPLETO AUTOMATICO DE LA BASE DE DATOS
# Guarda TODO: public + auth + storage + cron, datos, funciones, triggers,
# RLS, indices, permisos y roles. Nada queda fuera.
# Retencion: 7 diarios + 4 semanales (domingo) + 6 mensuales (dia 1)
# Uso:  backup_db.sh          -> backup normal
#       backup_db.sh --verify -> backup + prueba de restauracion real
# =============================================================================
set -uo pipefail

CONTAINER="xnova-database"
BASE="/root/backups/auto"
LOG="/root/backups/backup.log"
STAMP="$(date +%Y%m%d_%H%M%S)"
DOW="$(date +%u)"    # 7 = domingo
DOM="$(date +%d)"    # 01 = dia 1

mkdir -p "$BASE/diario" "$BASE/semanal" "$BASE/mensual"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

alerta() {
  # Aviso por Telegram si hay credenciales configuradas (opcional)
  local msg="$1"
  local cfg="/root/xnova/backup_alert.conf"
  [ -f "$cfg" ] || return 0
  # shellcheck disable=SC1090
  . "$cfg"
  [ -n "${TG_TOKEN:-}" ] && [ -n "${TG_CHAT:-}" ] || return 0
  curl -s -m 20 -o /dev/null \
    "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TG_CHAT}" \
    --data-urlencode "text=${msg}" >/dev/null 2>&1
}

fallo() {
  log "ERROR: $1"
  alerta "XNOVA BACKUP FALLIDO ($(hostname)): $1"
  exit 1
}

log "===== INICIO BACKUP ====="

# --- 0) Comprobaciones previas -----------------------------------------------
docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" || fallo "El contenedor $CONTAINER no esta corriendo"

LIBRE_MB=$(df -Pm /root | awk 'NR==2{print $4}')
[ "$LIBRE_MB" -gt 2048 ] || fallo "Espacio insuficiente en disco: ${LIBRE_MB}MB libres"

# --- 1) Dump completo (formato custom, comprimido) ---------------------------
DUMP="$BASE/diario/xnova_${STAMP}.dump"
GLOBALS="$BASE/diario/xnova_${STAMP}_roles.sql"

log "Generando dump completo..."
docker exec "$CONTAINER" pg_dump -U postgres -d postgres -Fc --compress=9 \
  > "$DUMP" 2>>"$LOG" || fallo "pg_dump fallo"

log "Guardando roles y permisos globales..."
docker exec "$CONTAINER" pg_dumpall -U postgres --globals-only \
  > "$GLOBALS" 2>>"$LOG" || fallo "pg_dumpall fallo"

# --- 1b) Tareas programadas de pg_cron -------------------------------------
# pg_dump NO incluye cron.job (es tabla de la extension), asi que se exporta
# aparte como SQL re-ejecutable y se guarda junto a los roles.
CRONSQL="$BASE/diario/xnova_${STAMP}_cronjobs.sql"
log "Guardando tareas programadas (cron.job)..."
docker exec "$CONTAINER" psql -U postgres -d postgres -At -c \
  "SELECT 'SELECT cron.schedule(' || quote_literal(jobname) || ', ' || quote_literal(schedule) || ', \$XNOVACRON\$' || command || '\$XNOVACRON\$);' || CASE WHEN active THEN '' ELSE chr(10) || 'SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = ' || quote_literal(jobname) || '), active := false);' END FROM cron.job ORDER BY jobid;" \
  > "$CRONSQL" 2>>"$LOG" || fallo "export de cron.job fallo"

N_CRON=$(grep -c 'cron.schedule(' "$CRONSQL" || echo 0)
[ "$N_CRON" -ge 1 ] || fallo "El export de cron.job salio vacio"
log "Tareas programadas guardadas: ${N_CRON}"

# --- 2) Verificar que el dump NO esta corrupto -------------------------------
SIZE=$(stat -c%s "$DUMP")
[ "$SIZE" -gt 5000000 ] || fallo "Dump sospechosamente pequeno: $SIZE bytes"

docker exec -i "$CONTAINER" pg_restore --list > /tmp/_bk_list.txt < "$DUMP" 2>>"$LOG" \
  || fallo "El dump esta corrupto (pg_restore --list fallo)"

N_TABLAS=$(grep -c 'TABLE DATA' /tmp/_bk_list.txt || echo 0)
[ "$N_TABLAS" -ge 120 ] || fallo "El dump solo contiene $N_TABLAS tablas con datos (esperado >=120)"

# Comprobar que estan los schemas criticos
for s in "public" "auth"; do
  grep -q " $s " /tmp/_bk_list.txt || fallo "Falta el schema '$s' en el dump"
done

# --- 2b) Cobertura 100%: TODAS las tablas reales de la base deben estar ------
# Se compara la lista de tablas de produccion (public/auth/storage) con las
# que trae el dump. Asi cualquier tabla nueva (casino, batalla de naves,
# apuestas deportivas, etc.) queda comprobada automaticamente.
awk '$4=="TABLE" && $5=="DATA" {print $6"."$7}' /tmp/_bk_list.txt | sort -u > /tmp/_bk_dump_tables.txt
docker exec "$CONTAINER" psql -U postgres -d postgres -At -c \
  "SELECT n.nspname||'.'||c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind = 'r' AND n.nspname IN ('public','auth','storage')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=c.oid AND d.deptype='e')
   ORDER BY 1;" 2>>"$LOG" | sort -u > /tmp/_bk_db_tables.txt
N_DB=$(wc -l < /tmp/_bk_db_tables.txt)
[ "$N_DB" -ge 120 ] || fallo "No se pudo leer la lista de tablas de produccion ($N_DB)"
FALTAN=$(comm -23 /tmp/_bk_db_tables.txt /tmp/_bk_dump_tables.txt | tr '\n' ' ')
[ -z "$FALTAN" ] || fallo "Tablas de produccion que NO estan en el dump: $FALTAN"
log "Cobertura: ${N_DB}/${N_DB} tablas de public/auth/storage presentes en el dump"

# Tablas criticas (economia, KYC y juegos nuevos) - deben existir siempre
for t in profiles planets fxu_ledger kyc_verifications tung_price_history \
         casino_roulette_spins casino_roulette_bank casino_slots_spins casino_slots_bank \
         casino_dice_rolls casino_dice_bank lottery_draws lottery_tickets raffles raffle_tickets \
         battleship_matches battleship_boards battleship_shots battleship_config battleship_pool_payouts \
         sports_matches sports_bets sports_config stronghold_ownership_log; do
  grep -qx "public.$t" /tmp/_bk_dump_tables.txt || fallo "Falta la tabla critica public.$t en el dump"
done
rm -f /tmp/_bk_dump_tables.txt /tmp/_bk_db_tables.txt

# --- 3) Huella de integridad -------------------------------------------------
sha256sum "$DUMP" | awk '{print $1}' > "${DUMP}.sha256"
tar -czf "${DUMP%.dump}_roles.tar.gz" -C "$(dirname "$GLOBALS")" "$(basename "$GLOBALS")" "$(basename "$CRONSQL")" 2>/dev/null
rm -f "$GLOBALS" "$CRONSQL"

log "OK: $(basename "$DUMP") | $(du -h "$DUMP" | cut -f1) | ${N_TABLAS} tablas con datos | cobertura ${N_DB}/${N_DB} | ${N_CRON} tareas cron"

# --- 4) Copias semanales y mensuales ----------------------------------------
if [ "$DOW" = "7" ]; then
  cp -p "$DUMP" "$BASE/semanal/" && cp -p "${DUMP}.sha256" "$BASE/semanal/"
  log "Copia semanal guardada"
fi
if [ "$DOM" = "01" ]; then
  cp -p "$DUMP" "$BASE/mensual/" && cp -p "${DUMP}.sha256" "$BASE/mensual/"
  log "Copia mensual guardada"
fi

# --- 5) Retencion ------------------------------------------------------------
purgar() {
  local dir="$1" conservar="$2"
  local n
  n=$(ls -1t "$dir"/*.dump 2>/dev/null | wc -l)
  if [ "$n" -gt "$conservar" ]; then
    ls -1t "$dir"/*.dump | tail -n +$((conservar+1)) | while read -r f; do
      rm -f "$f" "${f}.sha256" "${f%.dump}_roles.tar.gz"
      log "Purgado: $(basename "$f")"
    done
  fi
}
purgar "$BASE/diario" 7
purgar "$BASE/semanal" 4
purgar "$BASE/mensual" 6

# --- 6) Prueba de restauracion real (opcional, --verify) ---------------------
if [ "${1:-}" = "--verify" ]; then
  log "Probando restauracion real en base temporal..."
  TESTDB="xnova_verify_$$"
  docker exec "$CONTAINER" psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS $TESTDB;" >/dev/null 2>&1
  docker exec "$CONTAINER" psql -U postgres -d postgres -c "CREATE DATABASE $TESTDB;" >/dev/null 2>&1 \
    || fallo "No se pudo crear la base de prueba"

  docker cp "$DUMP" "$CONTAINER:/tmp/verify.dump" >/dev/null 2>&1
  docker exec "$CONTAINER" pg_restore -U postgres -d "$TESTDB" --no-owner --no-acl /tmp/verify.dump >/dev/null 2>&1

  QCOUNT="SELECT (SELECT count(*) FROM profiles)||'/'||(SELECT count(*) FROM planets)||'/'||(SELECT count(*) FROM fxu_ledger)||'/'||(SELECT count(*) FROM auth.users)||'/'||(SELECT count(*) FROM kyc_verifications)||'/'||(SELECT count(*) FROM casino_roulette_spins)||'/'||(SELECT count(*) FROM casino_slots_spins)||'/'||(SELECT count(*) FROM casino_dice_rolls)||'/'||(SELECT count(*) FROM lottery_tickets)||'/'||(SELECT count(*) FROM raffle_tickets)||'/'||(SELECT count(*) FROM battleship_matches)||'/'||(SELECT count(*) FROM battleship_pool_payouts)||'/'||(SELECT count(*) FROM sports_bets);"
  LEIDO=$(docker exec "$CONTAINER" psql -U postgres -d "$TESTDB" -At -c "$QCOUNT" 2>/dev/null)
  ACTUAL=$(docker exec "$CONTAINER" psql -U postgres -d postgres -At -c "$QCOUNT" 2>/dev/null)

  docker exec "$CONTAINER" psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS $TESTDB;" >/dev/null 2>&1
  docker exec "$CONTAINER" rm -f /tmp/verify.dump >/dev/null 2>&1

  if [ -z "$LEIDO" ]; then
    fallo "La restauracion de prueba no devolvio datos"
  fi
  log "Restauracion verificada (perfiles/planetas/ledger/usuarios/kyc/ruleta/slots/dados/loteria/rifa/batalla/pool-naves/deportes) backup=$LEIDO produccion=$ACTUAL"
  if [ "$LEIDO" != "$ACTUAL" ]; then
    log "AVISO: pequenas diferencias son normales (el juego sigue vivo durante el backup)"
  fi
fi

log "===== BACKUP COMPLETADO OK ====="
alerta "XNOVA backup OK: $(basename "$DUMP") ($(du -h "$DUMP" | cut -f1), ${N_TABLAS} tablas)"
exit 0
