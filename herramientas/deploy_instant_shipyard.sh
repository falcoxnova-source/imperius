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
[ -f "/tmp/newdist/dist/$NEWBUNDLE" ] || { echo "ERROR: el bundle referenciado no existe en el paquete"; exit 1; }

fail=0
if grep -qr "purchase_instant_unit" /tmp/newdist/dist/assets/; then
  echo "  OK    rpc purchase_instant_unit"
else
  echo "  FALTA rpc purchase_instant_unit"
  fail=1
fi
if grep -qr "instant_unit_catalog" /tmp/newdist/dist/assets/; then
  echo "  OK    vista instant_unit_catalog"
else
  echo "  FALTA vista instant_unit_catalog"
  fail=1
fi
if grep -qr "admin_update_instant_unit_offer" /tmp/newdist/dist/assets/; then
  echo "  OK    panel admin del astillero"
else
  echo "  FALTA panel admin del astillero"
  fail=1
fi
if grep -qr "Astillero Corporativo" /tmp/newdist/dist/assets/; then
  echo "  OK    textos del astillero"
else
  echo "  FALTA textos del astillero"
  fail=1
fi
[ "$fail" -eq 0 ] || { echo "ABORTADO: el paquete no contiene el astillero. No se ha modificado nada."; exit 1; }

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
grep -qr "purchase_instant_unit" frontend-html/assets/ && echo "OK: astillero presente en produccion"
echo "=== LISTO ==="
