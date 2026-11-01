#!/bin/bash
f=$(ls -t /root/xnova/frontend-html/assets/AdminPage-*.js | head -1)
echo "AdminPage chunk: $f"
echo "Has 'Deuda TUNG con usuarios': $(grep -c 'Deuda TUNG con usuarios' "$f")"
echo "USDT occurrences in chunk: $(grep -o 'USDT' "$f" | wc -l)"
echo "Has approx-USDT marker next to amounts: $(grep -o '\\\\u2248' "$f" | wc -l) (or literal):"
grep -o '≈ \$' "$f" | wc -l
