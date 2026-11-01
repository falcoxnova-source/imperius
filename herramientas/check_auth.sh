#!/bin/bash
docker exec xnova-database psql -U postgres -d postgres -c "SELECT id, email, encrypted_password IS NOT NULL as has_pass, raw_app_meta_data->>'provider' as provider FROM auth.users;"
