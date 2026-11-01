#!/bin/bash
cd /root/xnova/frontend-html/assets
for f in supabase-BB4509gp.js index-D3aLi2F0.js WalletPage-BmVmSLrh.js AdminPage-_i9nJEVP.js TasksPage-CNtCjbSV.js; do
  cp "$f" "$f.bak2"
  sed -i 's|http://76.13.98.28||g' "$f"
  echo "$f: $(grep -c '76.13.98.28' "$f") remaining"
done
echo "DONE"
