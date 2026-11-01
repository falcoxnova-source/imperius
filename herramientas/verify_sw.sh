#!/bin/bash
echo "=== served sw.js head ==="
curl -sk https://localhost/sw.js | head -1
echo "=== content-length ==="
curl -sk -I https://localhost/sw.js | grep -i content-length
echo "=== new fallback logic present? ==="
curl -sk https://localhost/sw.js | grep -nE 'Response\.error|navigate|index\.html'
