#!/bin/bash
echo "=== Stop auth ==="
docker stop xnova-auth 2>/dev/null

echo "=== Fix ownership ==="
docker exec xnova-database psql -U postgres -d postgres -c "ALTER TABLE auth.users OWNER TO supabase_auth_admin; ALTER TABLE auth.refresh_tokens OWNER TO supabase_auth_admin; ALTER TABLE auth.audit_log_entries OWNER TO supabase_auth_admin; ALTER TABLE auth.instances OWNER TO supabase_auth_admin; ALTER TABLE auth.schema_migrations OWNER TO supabase_auth_admin; ALTER TABLE auth.identities OWNER TO supabase_auth_admin; ALTER TABLE auth.sessions OWNER TO supabase_auth_admin; ALTER TABLE auth.mfa_factors OWNER TO supabase_auth_admin; ALTER TABLE auth.mfa_challenges OWNER TO supabase_auth_admin; ALTER TABLE auth.mfa_amr_claims OWNER TO supabase_auth_admin; ALTER TABLE auth.one_time_tokens OWNER TO supabase_auth_admin; ALTER TABLE auth.sso_providers OWNER TO supabase_auth_admin; ALTER TABLE auth.sso_domains OWNER TO supabase_auth_admin; ALTER TABLE auth.flow_state OWNER TO supabase_auth_admin; ALTER TABLE auth.saml_providers OWNER TO supabase_auth_admin; ALTER TABLE auth.saml_relay_states OWNER TO supabase_auth_admin;"

echo "=== Verify ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT tableowner FROM pg_tables WHERE tablename='users' AND schemaname='auth';"

echo "=== Start auth ==="
docker start xnova-auth
sleep 12
docker logs xnova-auth --tail 3
docker ps --filter name=xnova-auth --format '{{.Status}}'
