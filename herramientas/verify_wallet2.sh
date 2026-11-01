#!/bin/bash
echo "=== process-withdrawal/index.ts (key lines) ==="
grep -nE "PRIVATE_KEY|TUNG_CONTRACT|sign|Deno.env|privateKey|tokenAddress|contract" /root/xnova/supabase/functions/process-withdrawal/index.ts 2>/dev/null | head -40

echo
echo "=== auto-withdraw/index.ts (key lines) ==="
grep -nE "PRIVATE_KEY|TUNG_CONTRACT|sign|Deno.env|privateKey|tokenAddress|contract" /root/xnova/supabase/functions/auto-withdraw/index.ts 2>/dev/null | head -40

echo
echo "=== Install eth-account ==="
pip3 install --break-system-packages --quiet eth-account 2>&1 | tail -3

echo
echo "=== Verify PRIVATE_KEY -> DEPOSIT_WALLET ==="
python3 << 'PYEOF'
from eth_account import Account
pk = "0x4a17700792cc7b903c2f27225f9f868e7054f7c1bada741292fec756d8a9f9bf"
exp = "0x387526aa3f94f5C41e6a47D8c98751273e2214A3"
a = Account.from_key(pk)
print(f"Derived : {a.address}")
print(f"Expected: {exp}")
print(f"MATCH   : {a.address.lower() == exp.lower()}")
PYEOF
