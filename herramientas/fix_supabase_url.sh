#!/bin/bash
cd /root/xnova/frontend-html/assets
cp supabase-BB4509gp.js.bak2 supabase-BB4509gp.js
# Replace hardcoded IP URL with dynamic window.location.origin
sed -i 's|`http://76.13.98.28`|window.location.origin|g' supabase-BB4509gp.js
grep -o 'window.location.origin' supabase-BB4509gp.js && echo "PATCHED" || echo "FAILED"
