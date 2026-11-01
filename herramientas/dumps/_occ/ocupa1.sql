\set ON_ERROR_STOP 1
BEGIN;
\i /tmp/ocupa1_body.sql
COMMIT;
NOTIFY pgrst, 'reload schema';
