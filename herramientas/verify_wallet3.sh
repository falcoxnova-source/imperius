#!/bin/bash
set +e

echo "=== 1. Edge function process-withdrawal: token contract source ==="
grep -nE "TOKEN_CONTRACT|TUNG|tokenContract|0x0951" /root/xnova/supabase/functions/process-withdrawal/index.ts 2>/dev/null | head -15

echo
echo "=== 2. Edge function auto-withdraw: token contract source ==="
grep -nE "TOKEN_CONTRACT|TUNG|tokenContract|0x0951" /root/xnova/supabase/functions/auto-withdraw/index.ts 2>/dev/null | head -15

echo
echo "=== 3. Are edge functions actually invoked? (nginx routes) ==="
grep -nE "process-withdrawal|process-admin-withdrawal|auto-withdraw" /root/xnova/nginx/default-local.conf

echo
echo "=== 4. Is there any node/deno service handling withdrawals? ==="
ps aux | grep -iE "deno|node|withdraw" | grep -v grep | head -5
ss -tlnp 2>/dev/null | grep -E ":900[0-9]|:5400|:8000" | head -10

echo
echo "=== 5. Verify PK derives DEPOSIT_WALLET (using openssl/python) ==="
apt-get install -y python3-pip >/dev/null 2>&1
pip3 install --break-system-packages --quiet eth-account 2>&1 | tail -2
python3 << 'PYEOF'
try:
    from eth_account import Account
    pk = "0x4a17700792cc7b903c2f27225f9f868e7054f7c1bada741292fec756d8a9f9bf"
    exp = "0x387526aa3f94f5C41e6a47D8c98751273e2214A3"
    a = Account.from_key(pk)
    print(f"Derived : {a.address}")
    print(f"Expected: {exp}")
    print(f"MATCH   : {a.address.lower() == exp.lower()}")
except Exception as e:
    print(f"ERR: {e}")
PYEOF
