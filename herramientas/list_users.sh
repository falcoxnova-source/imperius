#!/bin/bash
docker exec xnova-database psql -U postgres -d postgres -c "SELECT email, raw_user_meta_data->>'username' as username, created_at FROM auth.users ORDER BY created_at;"
