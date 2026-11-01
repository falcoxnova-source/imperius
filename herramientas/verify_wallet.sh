#!/bin/bash
echo "=== 1. .env config ==="
grep -E '^(BSC_RPC_URL|DEPOSIT_WALLET|TUNG_CONTRACT|PRIVATE_KEY|REQUIRED_CONFIRMATIONS)=' /root/xnova/.env | sed 's/PRIVATE_KEY=\(.\{6\}\).*\(.\{4\}\)/PRIVATE_KEY=\1...\2/'

echo
echo "=== 2. deposit_service.py uses .env ==="
grep -nE "PRIVATE_KEY|TUNG_CONTRACT|DEPOSIT_WALLET|load_dotenv|getenv|environ" /root/xnova/deposit_service.py | head -25

echo
echo "=== 3. Derive address from private key ==="
python3 << 'PYEOF'
from eth_account import Account
pk = "0x4a17700792cc7b903c2f27225f9f868e7054f7c1bada741292fec756d8a9f9bf"
expected = "0x387526aa3f94f5C41e6a47D8c98751273e2214A3"
a = Account.from_key(pk)
print(f"Derived address  : {a.address}")
print(f"Expected DEPOSIT : {expected}")
print(f"MATCH            : {a.address.lower() == expected.lower()}")
PYEOF

echo
echo "=== 4. TUNG contract reachable on BSC (symbol + decimals) ==="
python3 << 'PYEOF'
from web3 import Web3
w = Web3(Web3.HTTPProvider("https://bsc-dataseed1.binance.org"))
addr = Web3.to_checksum_address("0x09514EcF8270C12101D077B5e8B034B164F71C5f")
abi = [
    {"constant":True,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"type":"function"},
    {"constant":True,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"type":"function"},
    {"constant":True,"inputs":[],"name":"name","outputs":[{"name":"","type":"string"}],"type":"function"},
    {"constant":True,"inputs":[{"name":"a","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"type":"function"},
]
c = w.eth.contract(address=addr, abi=abi)
try:
    print(f"BSC connected    : {w.is_connected()}")
    print(f"Token name       : {c.functions.name().call()}")
    print(f"Token symbol     : {c.functions.symbol().call()}")
    print(f"Decimals         : {c.functions.decimals().call()}")
    bal = c.functions.balanceOf(Web3.to_checksum_address("0x387526aa3f94f5C41e6a47D8c98751273e2214A3")).call()
    print(f"Deposit balance  : {bal / 10**18} TUNG")
    bnb = w.eth.get_balance(Web3.to_checksum_address("0x387526aa3f94f5C41e6a47D8c98751273e2214A3"))
    print(f"Deposit BNB      : {w.from_wei(bnb, 'ether')} BNB (for gas)")
except Exception as e:
    print(f"ERROR: {e}")
PYEOF

echo
echo "=== 5. wallet-info endpoint ==="
curl -s https://tung.xnova.xyz/functions/v1/wallet-info | head -c 400
echo

echo
echo "=== 6. Backend process and port ==="
ps aux | grep -E "deposit_service|withdraw" | grep -v grep
ss -tlnp | grep -E ":9001|:9002" | head -5
