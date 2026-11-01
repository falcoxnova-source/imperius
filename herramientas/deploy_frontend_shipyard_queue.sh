#!/bin/bash
set -e
cd /root/xnova

TS=$(date +%Y%m%d_%H%M%S)

echo "=== 1. Extrayendo el nuevo build ==="
rm -rf /tmp/newdist
mkdir -p /tmp/newdist
tar -xzf /tmp/dist-code.tgz -C /tmp/newdist

echo "=== 2. Verificando el paquete ANTES de tocar nada ==="
NEWBUNDLE=$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' /tmp/newdist/dist/index.html | sort -u | head -1)
echo "Bundle nuevo: $NEWBUNDLE"
[ -n "$NEWBUNDLE" ] || { echo "ERROR: no se encontro el bundle en index.html"; exit 1; }
[ -f "/tmp/newdist/dist/$NEWBUNDLE" ] || { echo "ERROR: el bundle referenciado no existe"; exit 1; }

fail=0

# --- arreglo de ESTA entrega: colas separadas de hangar y defensa ---
if grep -qE 'item_type===.(ship).' /tmp/newdist/dist/assets/ShipyardPage-*.js; then
  echo "  OK    ShipyardPage filtra solo NAVES"
else
  echo "  FALTA ShipyardPage no filtra por tipo"; fail=1
fi
if grep -qE 'item_type===.(defense).' /tmp/newdist/dist/assets/DefensePage-*.js; then
  echo "  OK    DefensePage filtra solo DEFENSAS"
else
  echo "  FALTA DefensePage no filtra por tipo"; fail=1
fi

# --- arreglos anteriores que NO se deben perder ---
for m in "total_jackpot_usdt" "Total acumulado" "tung_price_usd" "get_live_tung_price_usd"; do
  if grep -q "$m" "/tmp/newdist/dist/$NEWBUNDLE"; then
    echo "  OK    (previo) $m"
  else
    echo "  FALTA (previo) $m"; fail=1
  fi
done
if grep -qr "Number.isFinite" /tmp/newdist/dist/assets/MarketPage-*.js; then
  echo "  OK    (previo) fix del mercado"
else
  echo "  FALTA (previo) fix del mercado"; fail=1
fi

[ "$fail" -eq 0 ] || { echo "ABORTADO: faltan arreglos. No se ha modificado nada."; exit 1; }

echo "=== 3. Backup de frontend-html ==="
cp -r frontend-html "frontend-html.bak.$TS"
echo "Backup en /root/xnova/frontend-html.bak.$TS"

echo "=== 4. Reemplazando (Imagenes/ se conserva intacto) ==="
rm -rf frontend-html/assets
cp -rf /tmp/newdist/dist/. frontend-html/

echo "=== 5. Verificacion post-despliegue ==="
LIVE=$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' frontend-html/index.html | sort -u | head -1)
echo "Bundle servido ahora: $LIVE"
[ "$LIVE" = "$NEWBUNDLE" ] || { echo "ERROR: index.html no apunta al bundle nuevo"; exit 1; }
ls -la "frontend-html/$LIVE"
echo "Imagenes conservadas: $(du -sh frontend-html/Imagenes | cut -f1)"
grep -qE 'item_type===.(ship).'    frontend-html/assets/ShipyardPage-*.js && echo "OK: hangar solo naves en produccion"
grep -qE 'item_type===.(defense).' frontend-html/assets/DefensePage-*.js  && echo "OK: defensa solo defensas en produccion"

echo "=== 6. Limpiando bundles huerfanos ==="
find frontend-html/assets -name 'index-*.js' | while read -r f; do
  base=$(basename "$f")
  if [ "assets/$base" != "$LIVE" ]; then
    echo "  eliminando huerfano: $base"
    rm -f "$f"
  fi
done

echo ""
echo "DESPLIEGUE COMPLETADO. Rollback: cd /root/xnova && rm -rf frontend-html && mv frontend-html.bak.$TS frontend-html"
