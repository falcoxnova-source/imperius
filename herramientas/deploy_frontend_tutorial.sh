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

echo "Replacing frontend-html contents in-place"
rm -rf frontend-html/assets
cp -rf /tmp/newdist/dist/. frontend-html/

echo "Checking tutorial code is present in the bundle"
grep -rl "planet-selector" frontend-html/assets | head -3 || echo "WARN: marker not found"
grep -rl "set_tutorial_progress" frontend-html/assets | head -3 || echo "WARN: rpc not found"

echo "Done. Old backup at frontend-html.bak.$TS"
