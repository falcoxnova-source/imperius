#!/bin/bash
echo "=== ALL running containers ==="
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
echo
echo "=== What listens on 80/443 ==="
ss -ltnp 2>/dev/null | grep -E ':80|:443' || netstat -ltnp 2>/dev/null | grep -E ':80|:443'
echo
echo "=== Host nginx config referencing tung.xnova.xyz / sw.js / root ==="
grep -rln "tung.xnova.xyz\|xnova" /etc/nginx 2>/dev/null | head
echo "--- server_name + root in host nginx ---"
grep -rEn "server_name|root |proxy_pass" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -40
echo
echo "=== Find served sw.js on disk (built dist) ==="
find / -name 'sw.js' -path '*dist*' 2>/dev/null | grep -v node_modules | head
find /var/www /usr/share/nginx 2>/dev/null -name 'sw.js' | head
