\set ON_ERROR_STOP 1
BEGIN;
\i /tmp/ocupa1_body.sql
\i /tmp/ocupa1_tests.sql
ROLLBACK;
