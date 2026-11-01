#!/bin/sh
echo "=== Patching index-D3aLi2F0.js to disable realtime subscribe ==="

cd /root/xnova/frontend-html/assets/

# Backup
cp index-D3aLi2F0.js index-D3aLi2F0.js.bak3

# Find the subscribe call
echo "Searching for subscribe pattern..."
grep -oP '.{0,100}\.subscribe.{0,100}' index-D3aLi2F0.js | head -10

echo ""
echo "=== Searching for realtime/channel creation ==="
grep -oP '.{0,100}(channel|realtime).{0,100}' index-D3aLi2F0.js | head -10

echo ""
echo "=== Searching in vendor-supabase for WebSocket connect ==="
grep -oP '.{0,100}(WebSocket|wss://).{0,100}' vendor-supabase-B1d9hFZX.js | head -5
