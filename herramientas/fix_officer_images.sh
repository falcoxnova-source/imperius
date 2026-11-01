#!/bin/bash
set -e
sed -i 's/\r$//' /tmp/fix_officer_images.sql
docker cp /tmp/fix_officer_images.sql xnova-database:/tmp/fix_officer_images.sql
echo "=== Aplicando fix de image_url ==="
docker exec xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/fix_officer_images.sql
echo ""
echo "=== Verificacion ==="
docker exec xnova-database psql -U postgres -d postgres -At -c "SELECT code, image_url FROM officer_types ORDER BY sort_order;"
