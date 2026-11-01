#!/bin/bash
set -e
cd /root/xnova
TS=$(date +%Y%m%d_%H%M%S)
rm -rf /tmp/newdist
mkdir -p /tmp/newdist
tar -xzf /tmp/occ5.tgz -C /tmp/newdist
grep -rl "The ship is not consumed" /tmp/newdist/dist/assets >/dev/null || { echo "MARKER NOT FOUND"; exit 1; }
grep -rl "localhost:8000" /tmp/newdist/dist/assets >/dev/null && { echo "LOCALHOST FOUND"; exit 1; }
cp -a frontend-html "frontend-html.bak_occ5_$TS"
rsync -a --delete --exclude 'Imagenes' /tmp/newdist/dist/ frontend-html/
rm -rf /tmp/newdist /tmp/occ5.tgz
echo "OK backup frontend-html.bak_occ5_$TS"
