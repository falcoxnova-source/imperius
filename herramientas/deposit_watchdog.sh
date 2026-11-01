#!/bin/bash
# Vigilante del escaner de depositos de XNova.
# Detecta si el escaner se queda atrasado (endpoints RPC caidos, proceso colgado)
# y lo registra + reinicia el servicio. NO acredita nada, solo vigila.
LOG=/var/log/xnova-deposit-watchdog.log
STATE=/root/xnova/.deposit_scan_state.json
MAX_LAG=3000   # ~37 min de bloques BSC

HEAD=$(curl -s -m 15 -X POST https://bsc-dataseed.binance.org \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  | sed -n 's/.*"result":"\([^"]*\)".*/\1/p')
[ -z "$HEAD" ] && exit 0            # sin respuesta de la cadena: no hacemos nada
HEADDEC=$((HEAD))

LAST=$(sed -n 's/.*"last_block":[[:space:]]*\([0-9]*\).*/\1/p' "$STATE" 2>/dev/null)
[ -z "$LAST" ] && exit 0

LAG=$((HEADDEC - LAST))
TS=$(date -u '+%Y-%m-%d %H:%M:%S UTC')

if [ "$LAG" -gt "$MAX_LAG" ]; then
  echo "$TS ALERTA: escaner atrasado $LAG bloques (last=$LAST head=$HEADDEC). Reiniciando xnova-deposit." >> $LOG
  tail -5 /var/log/xnova-deposit.log >> $LOG
  systemctl restart xnova-deposit
else
  echo "$TS ok lag=$LAG" >> $LOG
fi

# no dejar crecer el log del vigilante
tail -2000 $LOG > $LOG.tmp && mv $LOG.tmp $LOG
