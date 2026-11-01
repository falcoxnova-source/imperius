#!/bin/sh
cd /root/xnova/frontend-html/assets/

echo "=== 1. Patch supabase URL ==="
sed -i 's|var t=`http://localhost:8000`|var t=window.location.origin|' supabase-B_B4q-7b.js
echo "Patched: $(grep -o 'var t=[^,;]*' supabase-B_B4q-7b.js | head -1)"

echo ""
echo "=== 2. Fix sw.js ==="
cat > /root/xnova/frontend-html/sw.js << 'EOF'
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', () => { self.registration.unregister(); });
EOF

echo ""
echo "=== 3. Verify AdminPage has Racha Diaria ==="
grep -c "Racha Diaria" AdminPage-BggLxzTc.js

echo ""
echo "=== 4. Clean old files ==="
rm -f AdminPage-1RVSoqOO.js AdminPage-_i9nJEVP.js AdminPage-BeCvkgXH.js 2>/dev/null
rm -f WalletPage-BmVmSLrh.js WalletPage-C6NtlJQV.js WalletPage-CpEuQf3F.js 2>/dev/null
rm -f index-D3aLi2F0.js index-Ccj4vDIO.js index-Co6ryeco.js 2>/dev/null
rm -f supabase-BB4509gp.js 2>/dev/null

echo ""
echo "=== 5. Current files ==="
ls index-*.js AdminPage-*.js WalletPage-*.js supabase-*.js 2>/dev/null

echo ""
echo "=== Done ==="
