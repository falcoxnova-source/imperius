#!/bin/bash
set -e

echo "=== 1. Check service_role exists ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT rolname FROM pg_roles WHERE rolname IN ('service_role','anon','authenticated','postgres') ORDER BY rolname;"

echo
echo "=== 2. Test SET LOCAL ROLE service_role works as postgres ==="
docker exec xnova-database psql -U postgres -d postgres -c "
BEGIN;
SET LOCAL ROLE service_role;
SELECT current_setting('role') AS role, current_user;
ROLLBACK;"

echo
echo "=== 3. Install python3-venv if missing ==="
apt-get install -y python3-venv 2>&1 | tail -3

echo
echo "=== 4. Create venv and install eth-account ==="
if [ ! -d /root/xnova/venv ]; then
  python3 -m venv /root/xnova/venv
fi
/root/xnova/venv/bin/pip install --upgrade pip --quiet 2>&1 | tail -3
/root/xnova/venv/bin/pip install --quiet eth-account 2>&1 | tail -5
echo "--- installed:"
/root/xnova/venv/bin/pip list 2>/dev/null | grep -iE "eth|rlp|hexbytes|cytoolz|pycryptodome" | head -20

echo
echo "=== 5. Verify eth-account signs correctly in venv ==="
/root/xnova/venv/bin/python3 << 'PYEOF'
from eth_account import Account
pk = "0x4a17700792cc7b903c2f27225f9f868e7054f7c1bada741292fec756d8a9f9bf"
a = Account.from_key(pk)
print(f"Address: {a.address}")
# test sign a dummy tx
tx = {"nonce": 0, "gasPrice": 3000000000, "gas": 100000, "to": "0x09514EcF8270C12101D077B5e8B034B164F71C5f",
      "value": 0, "data": "0xa9059cbb" + "0"*64 + format(1000000000000000000, "x").zfill(64), "chainId": 56}
signed = Account.sign_transaction(tx, pk)
raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction", None)
print(f"Signed tx length: {len(raw)} bytes")
print(f"Has raw_transaction: {hasattr(signed, 'raw_transaction')}, rawTransaction: {hasattr(signed, 'rawTransaction')}")
PYEOF
