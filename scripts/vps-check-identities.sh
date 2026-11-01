#!/bin/bash
echo "=== Check auth.identities columns ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'auth' AND table_name = 'identities' 
ORDER BY ordinal_position;
"
echo ""
echo "=== Test the migration condition ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT count(*) 
FROM auth.identities 
WHERE last_sign_in_at IS NULL 
  AND created_at = '2022-11-25' 
  AND provider = 'email';
"
