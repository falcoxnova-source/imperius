#!/bin/sh
echo "=== Patch supabase URL ==="
cd /root/xnova/frontend-html/assets/
sed -i 's|var t=`http://localhost:8000`|var t=window.location.origin|' supabase-B_B4q-7b.js
grep -o 'var t=[^,;]*' supabase-B_B4q-7b.js | head -1

echo ""
echo "=== Fix sw.js ==="
cat > /root/xnova/frontend-html/sw.js << 'EOF'
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', () => {
  self.registration.unregister();
});
EOF

echo ""
echo "=== Remove old index files (keep only new ones) ==="
rm -f /root/xnova/frontend-html/assets/index-D3aLi2F0.js*
rm -f /root/xnova/frontend-html/assets/index-Ccj4vDIO.js*
rm -f /root/xnova/frontend-html/assets/supabase-BB4509gp.js*
rm -f /root/xnova/frontend-html/assets/AdminPage-*.js.bak*
rm -f /root/xnova/frontend-html/assets/MarketPage-B2hLFv5M.js
rm -f /root/xnova/frontend-html/assets/MarketPage-DqDG8YaE.js
rm -f /root/xnova/frontend-html/assets/useIsUserPlus-Q22INbcz.js
rm -f /root/xnova/frontend-html/assets/useIsUserPlus-BV59RVKI.js

echo ""
echo "=== Verify current files ==="
ls /root/xnova/frontend-html/assets/index-*.js
ls /root/xnova/frontend-html/assets/AdminPage-*.js
ls /root/xnova/frontend-html/assets/supabase-*.js

echo ""
echo "=== Done ==="
