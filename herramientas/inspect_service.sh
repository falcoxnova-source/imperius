#!/bin/bash
echo "=== systemd unit for deposit_service.py ==="
ls -la /etc/systemd/system/ 2>/dev/null | grep -iE "deposit|xnova"
systemctl list-units --type=service --all 2>/dev/null | grep -iE "deposit|xnova" | head -10

echo
echo "=== How is python service started? ==="
ps -ef | grep deposit_service | grep -v grep
cat /proc/$(pgrep -f deposit_service.py | head -1)/cmdline 2>/dev/null | tr '\0' ' '; echo

echo
echo "=== Python venv check ==="
which python3
python3 --version
ls /root/xnova/venv 2>/dev/null && echo "venv exists" || echo "no venv"
python3 -c "import sys; print(sys.executable)"

echo
echo "=== Network: docker container can reach BSC? ==="
curl -s -X POST https://bsc-dataseed1.binance.org -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | head -c 200
echo
