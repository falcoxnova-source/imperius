#!/bin/sh
echo "=== Backing up current frontend ==="
cp -r /root/xnova/frontend-html /root/xnova/frontend-html-backup-$(date +%Y%m%d_%H%M%S)
echo "Backup created."
ls -la /root/xnova/frontend-html-backup-*/
