#!/bin/bash
echo "=== WalletPage bundle: supabase URL refs ==="
grep -oE 'https://[a-zA-Z0-9.-]+\.supabase\.co|window\.location\.origin|VITE_SUPABASE' /root/xnova/frontend-html/assets/WalletPage-*.js 2>/dev/null | sort -u | head -10

echo
echo "=== index bundle: supabase URL refs ==="
grep -oE 'https://[a-zA-Z0-9.-]+\.supabase\.co|window\.location\.origin' /root/xnova/frontend-html/assets/index-*.js 2>/dev/null | sort -u | head -10

echo
echo "=== supabase chunk: ==="
grep -oE 'https://[a-zA-Z0-9.-]+\.supabase\.co|window\.location\.origin' /root/xnova/frontend-html/assets/supabase-*.js 2>/dev/null | sort -u | head -10

echo
echo "=== WalletPage: how is wallet-info URL constructed? ==="
grep -oE 'wallet-info[^"]{0,80}|.{40}wallet-info' /root/xnova/frontend-html/assets/WalletPage-*.js 2>/dev/null | head -5

echo
echo "=== test wallet-info endpoint ==="
curl -s https://tung.xnova.xyz/functions/v1/wallet-info
echo
