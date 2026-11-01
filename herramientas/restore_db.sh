#!/bin/bash
# =============================================================================
# XNOVA - RESTAURAR LA BASE DE DATOS DESDE UN BACKUP
# Uso:  restore_db.sh /ruta/al/backup.dump
# =============================================================================
set -uo pipefail
CONTAINER="xnova-database"
DUMP="${1:-}"

if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "Uso: $0 /root/backups/auto/diario/xnova_XXXXXX.dump"
  echo ""
  echo "Backups disponibles:"
  ls -1t /root/backups/auto/diario/*.dump /root/backups/auto/semanal/*.dump /root/backups/auto/mensual/*.dump 2>/dev/null | head -20
  exit 1
fi

echo "==============================================="
echo " RESTAURACION DE LA BASE DE DATOS DE XNOVA"
echo "==============================================="
echo "Archivo : $DUMP"
echo "Tamano  : $(du -h "$DUMP" | cut -f1)"
echo "Fecha   : $(stat -c %y "$DUMP" | cut -d. -f1)"
echo ""

# Verificar integridad antes de tocar nada
if [ -f "${DUMP}.sha256" ]; then
  ESPERADO=$(cat "${DUMP}.sha256")
  ACTUAL=$(sha256sum "$DUMP" | awk '{print $1}')
  if [ "$ESPERADO" != "$ACTUAL" ]; then
    echo "ABORTADO: el archivo esta corrupto (la huella no coincide)"
    exit 1
  fi
  echo "Integridad verificada OK"
fi

docker exec -i "$CONTAINER" pg_restore --list > /dev/null < "$DUMP" 2>/dev/null \
  || { echo "ABORTADO: el dump no se puede leer"; exit 1; }

echo ""
echo "*** ESTO BORRA LOS DATOS ACTUALES Y LOS SUSTITUYE POR LOS DEL BACKUP ***"
echo ""
read -r -p "Escribe RESTAURAR para continuar: " CONF
[ "$CONF" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

# Red de seguridad: copia del estado actual antes de pisarlo
SAFETY="/root/backups/auto/ANTES_DE_RESTAURAR_$(date +%Y%m%d_%H%M%S).dump"
echo "Guardando copia del estado actual en $SAFETY ..."
docker exec "$CONTAINER" pg_dump -U postgres -d postgres -Fc --compress=9 > "$SAFETY" \
  || { echo "ABORTADO: no se pudo guardar la copia de seguridad previa"; exit 1; }
echo "Copia previa guardada ($(du -h "$SAFETY" | cut -f1))"

echo "Parando servicios para evitar escrituras..."
docker stop xnova-rest xnova-auth tung-telegram-bot >/dev/null 2>&1

echo "Restaurando... (puede tardar unos minutos)"
docker cp "$DUMP" "$CONTAINER:/tmp/restore.dump"
docker exec "$CONTAINER" pg_restore -U postgres -d postgres --clean --if-exists --no-owner --no-acl -j 2 /tmp/restore.dump 2>&1 | tail -20
docker exec "$CONTAINER" rm -f /tmp/restore.dump

echo "Reiniciando servicios..."
docker start xnova-rest xnova-auth tung-telegram-bot >/dev/null 2>&1
sleep 5
docker exec "$CONTAINER" psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';" >/dev/null 2>&1

echo ""
echo "=== ESTADO TRAS LA RESTAURACION ==="
docker exec "$CONTAINER" psql -U postgres -d postgres -At -c \
  "SELECT 'Jugadores: '||(SELECT count(*) FROM profiles)||' | Planetas: '||(SELECT count(*) FROM planets)||' | Movimientos: '||(SELECT count(*) FROM fxu_ledger)||' | Cuentas login: '||(SELECT count(*) FROM auth.users);"
echo ""
echo "RESTAURACION COMPLETADA."
echo "Si algo fue mal, puedes volver atras con:"
echo "  bash /root/xnova/restore_db.sh $SAFETY"
