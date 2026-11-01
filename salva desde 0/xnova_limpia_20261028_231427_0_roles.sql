--
-- PostgreSQL database cluster dump
--

SET default_transaction_read_only = off;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

--
-- Roles
--

CREATE ROLE anon;
ALTER ROLE anon WITH NOSUPERUSER NOINHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;
CREATE ROLE authenticated;
ALTER ROLE authenticated WITH NOSUPERUSER NOINHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;
CREATE ROLE authenticator;
ALTER ROLE authenticator WITH NOSUPERUSER NOINHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:i+f/XTDDQKWsXsfxS8JCNw==$MfjbEsI3O363v9eWTC6YJlPNC93UfwmzOP9DS77u65Q=:xqim+hpNeIZiU8H5Ld1j+Rlr7vSBRzxvEjwjQq8ZEYY=';
CREATE ROLE dashboard_user;
ALTER ROLE dashboard_user WITH NOSUPERUSER INHERIT CREATEROLE CREATEDB NOLOGIN REPLICATION NOBYPASSRLS;
CREATE ROLE pgbouncer;
ALTER ROLE pgbouncer WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS;
CREATE ROLE postgres;
ALTER ROLE postgres WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:kwp2Ao9ZRaD6oB9HLjCwow==$gWY9sYPpTpq80YOHEpNyY/iImxkwfb/IHszRZnL12rs=:Hd0qs7ue1UDwT8PJYcK/emYo0dka/nwQTnkSeiUnjMI=';
CREATE ROLE service_role;
ALTER ROLE service_role WITH NOSUPERUSER NOINHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION BYPASSRLS;
CREATE ROLE so;
ALTER ROLE so WITH SUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:NVNxjhzjaak3sD0jLPrzAw==$/vgBJydBd1dp5PZq9SeNsuG0YQOAty2d7ajIGcBgtbk=:2O+1BVqxrxnYY8xq+5Xpbo5tXwEmsaHHWayydx6qIkU=';
CREATE ROLE supabase_admin;
ALTER ROLE supabase_admin WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:BUT6HZvZhSaj6Ku2galVcA==$/nj9NeZx90tf9oHWb2ftt/KFqRaTkroY2HXhBddFyA8=:Scdjy+axKrj0bni8n6SxuOlC7vqiavQqhtMZgsOwsTM=';
CREATE ROLE supabase_auth_admin;
ALTER ROLE supabase_auth_admin WITH NOSUPERUSER NOINHERIT CREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:PxSh6uovgqbDV8zBFEXwtA==$3xNDUIVqhxPMcdSX7bcl4SwNKrhkFB70GPGsXOLnr4M=:rchBx901ry2NPOhtYVNTGNEjSvE5jI5X07lL39wrdvY=';
CREATE ROLE supabase_functions_admin;
ALTER ROLE supabase_functions_admin WITH NOSUPERUSER NOINHERIT CREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS;
CREATE ROLE supabase_read_only_user;
ALTER ROLE supabase_read_only_user WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION BYPASSRLS;
CREATE ROLE supabase_replication_admin;
ALTER ROLE supabase_replication_admin WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN REPLICATION NOBYPASSRLS;
CREATE ROLE supabase_storage_admin;
ALTER ROLE supabase_storage_admin WITH NOSUPERUSER NOINHERIT CREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:kZkLqmDadf43J2DI+sqg4w==$J8Jed8GZqcJvblkr21UML4P2aK6Y+KyqLMdeHiHdkpM=:6WFVsT58tff90YNIyEAcmsKdmdsvnr6twcbsU5ZioEg=';
CREATE ROLE tung_bot;
ALTER ROLE tung_bot WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION BYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:SZzGOdUcs6CT27DyonvKzQ==$4mRrwKi+FoVi93u75OvSSFfMJS9aS4NoCsMSjm/99iQ=:Xym0Ud1B2bE0OpblrWWwxSbrWik86PYxpNycN4S4oLM=';

--
-- User Configurations
--

--
-- User Config "anon"
--

ALTER ROLE anon SET statement_timeout TO '3s';
ALTER ROLE anon SET search_path TO 'public', 'storage', 'auth', 'extensions';

--
-- User Config "authenticated"
--

ALTER ROLE authenticated SET statement_timeout TO '8s';
ALTER ROLE authenticated SET search_path TO 'public', 'storage', 'auth', 'extensions';

--
-- User Config "postgres"
--

ALTER ROLE postgres SET search_path TO 'auth', 'public';

--
-- User Config "service_role"
--

ALTER ROLE service_role SET search_path TO 'public', 'storage', 'auth', 'extensions';

--
-- User Config "supabase_admin"
--

ALTER ROLE supabase_admin SET search_path TO E'\\$user', 'public', 'auth', 'extensions';

--
-- User Config "supabase_auth_admin"
--

ALTER ROLE supabase_auth_admin SET search_path TO 'auth';

--
-- User Config "supabase_storage_admin"
--

ALTER ROLE supabase_storage_admin SET search_path TO 'storage', 'public';


--
-- Role memberships
--

GRANT anon TO authenticator GRANTED BY postgres;
GRANT anon TO supabase_storage_admin GRANTED BY postgres;
GRANT authenticated TO authenticator GRANTED BY postgres;
GRANT authenticated TO supabase_storage_admin GRANTED BY postgres;
GRANT pg_read_all_data TO supabase_read_only_user GRANTED BY postgres;
GRANT service_role TO authenticator GRANTED BY postgres;
GRANT service_role TO supabase_storage_admin GRANTED BY postgres;
GRANT supabase_admin TO authenticator GRANTED BY postgres;






--
-- PostgreSQL database cluster dump complete
--

