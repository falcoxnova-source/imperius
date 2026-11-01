#!/bin/bash
echo "=== Search deployed bundle for new market fee string ==="
f=$(grep -rl "Top 50" /root/xnova/frontend-html/assets/*.js 2>/dev/null | head -1)
echo "File: $f"
grep -o "Resto . 40%" "$f" | head -1 && echo "FOUND new tiers (40% Resto)" || echo "NOT found"
grep -o "Resto . 30%" "$f" | head -1 && echo "WARNING: old 30% still present" || echo "old 30% gone (good)"
