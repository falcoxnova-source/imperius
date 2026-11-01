#!/bin/bash
set -e
echo "=== before: current main bundle referenced ==="
grep -o 'assets/index-[A-Za-z0-9_]*\.js' /root/xnova/frontend-html/index.html | sort -u
echo "OLD bundles in assets (index-*.js):"
ls -1 /root/xnova/frontend-html/assets/index-*.js 2>/dev/null
