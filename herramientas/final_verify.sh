#!/bin/sh
rm -f /root/xnova/frontend-html/assets/AdminPage-_i9nJEVP.js*
echo "Index ref:"
grep -o 'src="/assets/index-[^"]*\.js"' /root/xnova/frontend-html/index.html
echo "Admin ref:"
grep -o 'src="/assets/AdminPage-[^"]*\.js"' /root/xnova/frontend-html/index.html
