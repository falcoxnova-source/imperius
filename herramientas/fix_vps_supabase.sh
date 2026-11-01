#!/bin/sh
echo "=== Patching supabase URL properly ==="
cd /root/xnova/frontend-html/assets/

# Check what the URL pattern looks like
echo "Current URL:"
grep -o "var t='[^']*'" supabase-B_B4q-7b.js 2>/dev/null
grep -o 'var t=`[^`]*`' supabase-B_B4q-7b.js 2>/dev/null

echo ""
echo "=== Fix: replace localhost URL with window.location.origin ==="
# The URL is set as backtick literal: var t=`http://localhost:8000`
sed -i 's|var t=`http://localhost:8000`|var t=window.location.origin|' supabase-B_B4q-7b.js

echo "After fix:"
grep -o 'var t=[^,;]*' supabase-B_B4q-7b.js | head -3

echo ""
echo "=== Also remove old supabase files ==="
rm -f supabase-BB4509gp.js supabase-BB4509gp.js.bak2 supabase-B4VEmt_E.js 2>/dev/null

echo "=== Verify ==="
ls -la supabase*.js
