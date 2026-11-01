for f in ocupa1_body.sql ocupa1.sql; do sed -i 's/\r$//' /tmp/$f; docker cp /tmp/$f xnova-database:/tmp/$f; done
docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -f /tmp/ocupa1.sql < /dev/null 2>&1 | grep -v -E '^(CREATE|DROP|DO|ALTER|REVOKE|GRANT|INSERT|COMMENT)' 
echo "== verify"
docker exec -i xnova-database psql -U postgres -d postgres -At -c "select count(*) from occupations; select id, code from ship_types where code='occupation_ship'; select jobname, schedule from cron.job where jobname='occupation-build-tick'; select count(*) from pg_proc where pronamespace='public'::regnamespace and pg_get_functiondef(oid) like '%[OCUPA1-%';" < /dev/null
