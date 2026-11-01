#!/bin/sh
echo "=== Patching supabase-B_B4q-7b.js ==="
cd /root/xnova/frontend-html/assets/

# Backup
cp supabase-B_B4q-7b.js supabase-B_B4q-7b.js.bak

# Check current URL pattern
echo "Current URL pattern:"
grep -o "var t='[^']*'" supabase-B_B4q-7b.js | head -3

# Replace hardcoded URL with window.location.origin  
sed -i "s|var t='[^']*'|var t=window.location.origin|" supabase-B_B4q-7b.js

echo "After patch:"
grep -o "var t=[^;]*" supabase-B_B4q-7b.js | head -3

echo ""
echo "=== Also patch sw.js ==="
cd /root/xnova/frontend-html/
# Use the self-unregistering service worker
cat > sw.js << 'SWEOF'
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', () => {
  self.registration.unregister();
});
SWEOF
echo "sw.js patched"

echo ""
echo "=== Done ==="
ls -la /root/xnova/frontend-html/assets/supabase*.js
