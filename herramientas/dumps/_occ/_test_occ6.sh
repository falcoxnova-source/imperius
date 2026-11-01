#!/bin/bash
sed -i 's/\r$//' /tmp/test_occ6.sql
docker cp /tmp/test_occ6.sql xnova-database:/tmp/test_occ6.sql
docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/test_occ6.sql 2>&1 | grep -E 'NOTICE|ERROR|ROLLBACK' | grep -v 'hostile'
