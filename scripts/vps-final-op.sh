#!/bin/bash
set -e
echo "=== Creating uuid = text operator (hard way) ==="
docker exec xnova-database psql -U postgres -d postgres <<'EOF'
-- We need an actual operator for uuid = text
-- The right side is user_id::text which is text
-- The left side is id which is uuid
-- So we need: uuid = text

CREATE OR REPLACE FUNCTION public.uuid_text_eq(uuid, text) 
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS 'SELECT $1::text = $2';

DROP OPERATOR IF EXISTS public.= (uuid, text);
CREATE OPERATOR public.= (
  FUNCTION = public.uuid_text_eq,
  LEFTARG = uuid,
  RIGHTARG = text,
  COMMUTATOR = OPERATOR(public.=)
);

-- Test it!
SELECT 'test_1' as test, '550e8400-e29b-41d4-a716-446655440000'::uuid = '550e8400-e29b-41d4-a716-446655440000' as result;
EOF

echo "=== Restart auth ==="
docker restart xnova-auth
sleep 10
docker logs xnova-auth --tail 5
docker ps --filter name=xnova-auth --format '{{.Status}}'
