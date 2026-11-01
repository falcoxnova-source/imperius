#!/bin/bash
# Post-migration fix for supabase_auth_admin password
docker exec xnova-database psql -U postgres -d postgres <<'EOF'
SET password_encryption = 'md5';
ALTER USER supabase_auth_admin WITH PASSWORD 'xnova123';
SELECT usename, passwd IS NOT NULL as has_pwd FROM pg_shadow WHERE usename = 'supabase_auth_admin';
EOF
