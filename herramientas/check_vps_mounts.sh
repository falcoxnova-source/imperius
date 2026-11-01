#!/bin/sh
echo "=== Docker inspect kong ==="
docker inspect xnova-kong --format '{{json .Mounts}}' 2>&1

echo ""
echo "=== Docker inspect all ==="
docker inspect xnova-kong --format '{{json .HostConfig.Binds}}' 2>&1
