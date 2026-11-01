cd /tmp
for f in ocupa1_body.sql ocupa1_tests.sql ocupa1_testrun.sql; do sed -i 's/\r$//' /tmp/$f; docker cp /tmp/$f xnova-database:/tmp/$f; done
docker exec -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -f /tmp/ocupa1_testrun.sql < /dev/null
