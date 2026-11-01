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

echo "Checking lottery USD pricing code is present in the bundle"
grep -rl "p_ticket_cost_usd" frontend-html/assets | head -3 || echo "WARN: admin param not found"
grep -rl "lottery_ticket_cost_usd" frontend-html/assets | head -3 || echo "WARN: setting key not found"
grep -rl "usd_mode" frontend-html/assets | head -3 || echo "WARN: usd_mode not found"

echo "Done. Old backup at frontend-html.bak.$TS"
