#!/bin/bash
set -e
echo "=== Creating missing operator uuid = text ==="
docker exec xnova-database psql -U postgres -d postgres <<'EOF'
-- Create function for uuid = text comparison
CREATE OR REPLACE FUNCTION auth.uuid_eq_text(uuid, text) RETURNS boolean AS $$
  SELECT $1::text = $2;
$$ LANGUAGE sql IMMUTABLE;

-- Create operator
DROP OPERATOR IF EXISTS = (uuid, text);
CREATE OPERATOR = (
  FUNCTION = auth.uuid_eq_text,
  LEFTARG = uuid,
  RIGHTARG = text
);
EOF

echo "=== Testing the migration manually ==="
docker exec xnova-database psql -U postgres -d postgres <<'EOF'
DO $$
BEGIN
  UPDATE auth.identities
  SET last_sign_in_at = '2022-11-25'
  WHERE
    last_sign_in_at IS NULL AND
    created_at = '2022-11-25' AND
    updated_at = '2022-11-25' AND
    provider = 'email' AND
    id = user_id::text;
END $$;
SELECT 'MIGRATION_OK' as status;
EOF

echo "=== Restart auth ==="
docker restart xnova-auth
sleep 10
docker logs xnova-auth --tail 5
docker ps --filter name=xnova-auth --format '{{.Status}}'
