#!/bin/bash
set -e
cd /root/xnova
TS=$(date +%Y%m%d_%H%M%S)
echo "Backing up frontend-html to frontend-html.bak.$TS"
cp -r frontend-html "frontend-html.bak.$TS"

echo "Extracting new dist"
rm -rf /tmp/newdist
mkdir -p /tmp/newdist
tar -xzf /tmp/dist.tgz -C /tmp/newdist

echo "Replacing frontend-html contents in-place (preserving non-build static assets)"
rm -rf frontend-html/assets
cp -rf /tmp/newdist/dist/. frontend-html/

echo "Verifying key files exist"
ls -la frontend-html/assets | grep -E "TreasurePlanetPage|FortressPage|AdminPage" || true

echo "Done. Old backup at frontend-html.bak.$TS"
