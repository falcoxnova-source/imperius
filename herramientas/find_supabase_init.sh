#!/bin/sh
echo "=== Find realtime config and createClient in supabase JS ==="
# Search for the pattern that sets up realtime
grep -oP '.{0,100}realtime.{0,200}' /root/xnova/frontend-html/assets/supabase-B_B4q-7b.js

echo ""
echo "=== Find createClient or SupabaseClient ==="
grep -oP '.{0,50}(createClient|SupabaseClient).{0,200}' /root/xnova/frontend-html/assets/supabase-B_B4q-7b.js

echo ""
echo "=== Find the export that creates the client ==="
grep -oP '.{0,200}export.{0,100}' /root/xnova/frontend-html/assets/supabase-B_B4q-7b.js
