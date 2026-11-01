#!/bin/sh
echo "=== What is the 1 USDT reference in the wallet JS? ==="
grep -o '.\{0,100\}USDT.\{0,100\}\|.\{0,100\}usdt.\{0,100\}\|.\{0,100\}Usdt.\{0,100\}' /root/xnova/frontend-html/assets/WalletPage-BmVmSLrh.js 2>&1

echo ""
echo "=== Same in the bak2 ==="
grep -o '.\{0,100\}USDT.\{0,100\}\|.\{0,100\}usdt.\{0,100\}\|.\{0,100\}Usdt.\{0,100\}' /root/xnova/frontend-html/assets/WalletPage-BmVmSLrh.js.bak2 2>&1
