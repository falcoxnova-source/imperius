#!/bin/sh
echo "=== 1. Fix nginx wallet-info: remove USDT fields ==="
cd /root/xnova/nginx
cp default-local.conf default-local.conf.bak_wallet

# Update wallet-info to only TUNG
python3 << 'PYEOF'
with open('/root/xnova/nginx/default-local.conf', 'r') as f:
    content = f.read()

old_wallet = '''    location = /functions/v1/wallet-info {
        access_log off;
        return 200 '{"success":true,"depositAddress":"0x387526aa3f94f5C41e6a47D8c98751273e2214A3","tokenContract":"0x09514EcF8270C12101D077B5e8B034B164F71C5f","usdtContract":"","chainId":56,"depositsEnabled":true,"usdtDepositsEnabled":false,"config":{"requiredConfirmations":3}}';
        add_header Content-Type application/json;
    }'''

new_wallet = '''    location = /functions/v1/wallet-info {
        access_log off;
        return 200 '{"success":true,"depositAddress":"0x387526aa3f94f5C41e6a47D8c98751273e2214A3","tokenContract":"0x09514EcF8270C12101D077B5e8B034B164F71C5f","chainId":56,"depositsEnabled":true,"config":{"requiredConfirmations":3}}';
        add_header Content-Type application/json;
    }'''

if old_wallet in content:
    content = content.replace(old_wallet, new_wallet)
    print("Replaced wallet-info block")
else:
    print("Could not find exact wallet-info block, searching...")
    # Try to find by pattern
    import re
    match = re.search(r'location = /functions/v1/wallet-info \{.*?\}', content, re.DOTALL)
    if match:
        print("Found block, replacing...")
        content = content.replace(match.group(), new_wallet.strip())
        print("Replaced")
    else:
        print("NOT FOUND")

with open('/root/xnova/nginx/default-local.conf', 'w') as f:
    f.write(content)
PYEOF

echo ""
echo "=== 2. Reload nginx ==="
docker exec xnova-kong nginx -t 2>&1 && docker exec xnova-kong nginx -s reload 2>&1

echo ""
echo "=== 3. Test wallet-info ==="
curl -sk 'https://127.0.0.1/functions/v1/wallet-info' 2>&1

echo ""
echo "=== 4. Uncomment PRIVATE_KEY in .env ==="
sed -i 's|^# PRIVATE_KEY=|PRIVATE_KEY=|' /root/xnova/.env
grep "PRIVATE_KEY" /root/xnova/.env

echo ""
echo "=== Done ==="
