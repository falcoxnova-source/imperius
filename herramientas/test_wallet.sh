#!/bin/sh
echo "=== Test wallet-info endpoint ==="
curl -sk 'https://127.0.0.1/functions/v1/wallet-info' 2>&1

echo ""
echo ""
echo "=== Test via HTTP (port 80 redirect) ==="
curl -sL 'http://127.0.0.1/functions/v1/wallet-info' 2>&1 | head -c 500
