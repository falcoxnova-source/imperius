#!/bin/bash
set -e
cd /root/xnova
TS=$(date +%Y%m%d_%H%M%S)

echo "== Validando sintaxis =="
python3 -m py_compile /tmp/ws_server_new.py

echo "== Backup =="
cp ws_server.py "ws_server.py.bak.$TS"

echo "== Instalando =="
sed -i 's/\r$//' /tmp/ws_server_new.py
cp /tmp/ws_server_new.py ws_server.py
chmod +x ws_server.py

echo "== Reiniciando servicio =="
systemctl restart xnova-ws
sleep 3
systemctl is-active xnova-ws

echo "== Handshake local =="
python3 - <<'PY'
import socket, base64, os, json, time
s = socket.create_connection(('127.0.0.1', 9090), timeout=8)
key = base64.b64encode(os.urandom(16)).decode()
s.sendall((
    "GET /realtime/v1/websocket?vsn=2.0.0 HTTP/1.1\r\n"
    "Host: 127.0.0.1\r\n"
    "Upgrade: websocket\r\n"
    "Connection: Upgrade\r\n"
    "Sec-WebSocket-Version: 13\r\n"
    f"Sec-WebSocket-Key: {key}\r\n\r\n"
).encode())
resp = s.recv(1024).decode('latin-1', 'replace')
print("HANDSHAKE:", resp.splitlines()[0])
assert "101" in resp, "handshake FALLIDO"

def frame(text):
    p = text.encode()
    m = os.urandom(4)
    out = bytearray([0x81])
    n = len(p)
    assert n < 126
    out.append(0x80 | n)
    out.extend(m)
    out.extend(bytes(b ^ m[i % 4] for i, b in enumerate(p)))
    return bytes(out)

s.sendall(frame(json.dumps(["1","1","realtime:test","phx_join",{}])))
s.settimeout(6)
data = s.recv(4096)
print("PHX_JOIN REPLY:", data[2:].decode('utf-8', 'replace')[:200])

s.sendall(frame(json.dumps([None,"2","phoenix","heartbeat",{}])))
data = s.recv(4096)
print("HEARTBEAT REPLY:", data[2:].decode('utf-8', 'replace')[:200])
s.close()
print("OK")
PY

echo "== Procesos / zombies =="
echo -n "procs: "; ps -eo stat,cmd | grep -c '[w]s_server.py'
echo -n "zombies: "; ps -eo stat,cmd | grep '[w]s_server.py' | grep -c '^Z' || true

echo "Backup en ws_server.py.bak.$TS"
