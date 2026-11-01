#!/bin/bash
set -e
echo "=== Creating uuid = text operator in public schema ==="
docker exec xnova-database psql -U postgres -d postgres <<'EOF'
-- Drop if exists
DROP OPERATOR IF EXISTS public.= (uuid, text);
DROP FUNCTION IF EXISTS public.uuid_eq_text(uuid, text);

-- Create function
CREATE FUNCTION public.uuid_eq_text(uuid, text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$ SELECT $1::text = $2; $$;

-- Create operator in public schema
CREATE OPERATOR public.= (
  FUNCTION = public.uuid_eq_text,
  LEFTARG = uuid,
  RIGHTARG = text
);

-- Test
SELECT 'test' as result, '550e8400-e29b-41d4-a716-446655440000'::uuid = '550e8400-e29b-41d4-a716-446655440000' as should_be_true;
EOF

echo "=== Restart auth ==="
docker restart xnova-auth
sleep 10
echo "=== Auth logs ==="
docker logs xnova-auth --tail 5
echo "=== Status ==="
docker ps --filter name=xnova-auth --format '{{.Status}}'
