#!/bin/bash
docker exec xnova-kong grep -oE '.{0,80}USDT.{0,80}' /usr/share/nginx/html/assets/index-D3aLi2F0.js 2>/dev/null | while read line; do
  echo "$line"
  echo "---"
done
