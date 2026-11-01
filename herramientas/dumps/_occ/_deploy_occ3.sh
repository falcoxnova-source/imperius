#!/bin/bash
set -e
cd /root/xnova
TS=$(date +%Y%m%d_%H%M%S)
rm -rf /tmp/newdist
mkdir -p /tmp/newdist
tar -xzf /tmp/occ3.tgz -C /tmp/newdist
grep -rl "get_occupation_planet_view" /tmp/newdist/dist/assets >/dev/null || { echo "MARKER NOT FOUND"; exit 1; }
grep -rl "localhost:8000" /tmp/newdist/dist/assets >/dev/null && { echo "LOCALHOST FOUND"; exit 1; }
cp -a frontend-html "frontend-html.bak_occ3_$TS"
rsync -a --delete --exclude 'Imagenes' /tmp/newdist/dist/ frontend-html/
rm -rf /tmp/newdist /tmp/occ3.tgz
echo "OK backup frontend-html.bak_occ3_$TS"
