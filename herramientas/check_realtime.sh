#!/bin/sh
echo "=== Read current realtime section ==="
LINE=$(grep -n "realtime/v1" /root/xnova/nginx/default-local.conf | head -1 | cut -d: -f1)
echo "Found at line: $LINE"
head -$((LINE+4)) /root/xnova/nginx/default-local.conf | tail -6