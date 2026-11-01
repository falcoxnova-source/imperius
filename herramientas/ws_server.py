#!/usr/bin/env python3
"""
Minimal WebSocket server that accepts connections and keeps them alive.
Uses only Python standard library - no external dependencies.
Purpose: Accept Supabase realtime connections so the client doesn't retry infinitely.
"""
import socket
import struct
import hashlib
import base64
import os
import sys
import signal
import time

# Configuration
HOST = '127.0.0.1'
PORT = 9090
WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

def generate_accept_key(key):
    """Generate Sec-WebSocket-Accept key from client key."""
    sha1 = hashlib.sha1((key + WEBSOCKET_GUID).encode()).digest()
    return base64.b64encode(sha1).decode()

def handle_websocket_handshake(conn, data):
    """Parse HTTP upgrade request, extract key, return accept key."""
    headers = data.decode('latin-1', errors='replace')
    key = None
    for line in headers.split('\r\n'):
        if line.lower().startswith('sec-websocket-key:'):
            key = line.split(':', 1)[1].strip()
            break
    return key

def send_frame(conn, opcode, payload=b''):
    """Send a WebSocket frame."""
    length = len(payload)
    frame = bytearray()
    frame.append(0x80 | opcode)  # FIN + opcode
    
    if length < 126:
        frame.append(length)
    elif length < 65536:
        frame.append(126)
        frame.extend(struct.pack('>H', length))
    else:
        frame.append(127)
        frame.extend(struct.pack('>Q', length))
    
    frame.extend(payload)
    conn.send(bytes(frame))

def read_frame(conn):
    """Read a WebSocket frame. Returns (opcode, payload)."""
    try:
        data = conn.recv(2)
        if len(data) < 2:
            return None, None
        opcode = data[0] & 0x0F
        masked = data[1] & 0x80
        length = data[1] & 0x7F
        
        if length == 126:
            data = conn.recv(2)
            length = struct.unpack('>H', data)[0]
        elif length == 127:
            data = conn.recv(8)
            length = struct.unpack('>Q', data)[0]
        
        if masked:
            mask = conn.recv(4)
            payload = bytearray(conn.recv(length))
            for i in range(length):
                payload[i] ^= mask[i % 4]
            return opcode, bytes(payload)
        else:
            payload = conn.recv(length)
            return opcode, payload
    except:
        return None, None

def handle_client(conn, addr):
    """Handle a single WebSocket client connection."""
    try:
        conn.settimeout(5)
        data = conn.recv(4096)
        if not data:
            conn.close()
            return
        
        # Check if it's a WebSocket upgrade request
        key = handle_websocket_handshake(conn, data)
        
        if key:
            # Send 101 Switching Protocols
            accept = generate_accept_key(key)
            response = (
                'HTTP/1.1 101 Switching Protocols\r\n'
                'Upgrade: websocket\r\n'
                'Connection: Upgrade\r\n'
                f'Sec-WebSocket-Accept: {accept}\r\n'
                '\r\n'
            )
            conn.send(response.encode())
            print(f'[WS] WebSocket connected from {addr}')
        else:
            # Not a WebSocket request, send 426
            response = (
                'HTTP/1.1 426 Upgrade Required\r\n'
                'Content-Type: application/json\r\n'
                'Content-Length: 38\r\n'
                'Connection: close\r\n'
                '\r\n'
                '{"error":"realtime not available"}'
            )
            conn.send(response.encode())
            conn.close()
            return
        
        # Keep connection alive - respond to pings, ignore everything else
        conn.settimeout(30)
        idle_since = time.time()
        
        while True:
            try:
                opcode, payload = read_frame(conn)
                if opcode is None:
                    break
                
                if opcode == 0x9:  # Ping
                    send_frame(conn, 0xA, payload)  # Pong
                    idle_since = time.time()
                elif opcode == 0x8:  # Close
                    send_frame(conn, 0x8)  # Close acknowledgement
                    break
                # Ignore all other frames (text, binary, etc.)
                
            except socket.timeout:
                # Send a ping every 25 seconds to keep connection alive
                if time.time() - idle_since > 25:
                    send_frame(conn, 0x9, b'keepalive')
                    idle_since = time.time()
                continue
            except:
                break
                
    except Exception as e:
        print(f'[WS] Error handling {addr}: {e}')
    finally:
        try:
            conn.close()
        except:
            pass
        print(f'[WS] Connection closed from {addr}')

def main():
    print(f'[WS] Starting WebSocket blackhole server on {HOST}:{PORT}')
    
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((HOST, PORT))
    server.listen(10)
    
    # Handle SIGTERM gracefully
    signal.signal(signal.SIGTERM, lambda s, f: sys.exit(0))
    signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))
    
    while True:
        try:
            conn, addr = server.accept()
            pid = os.fork()
            if pid == 0:
                # Child process
                server.close()
                handle_client(conn, addr)
                sys.exit(0)
            else:
                conn.close()
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f'[WS] Accept error: {e}')
            time.sleep(1)
    
    server.close()

if __name__ == '__main__':
    main()
