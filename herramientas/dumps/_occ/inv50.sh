#!/bin/bash
docker exec -i -e PGCLIENTENCODING=UTF8 xnova-database psql -U postgres -d postgres -At <<'SQL'
\echo '=== cols ==='
select table_name, string_agg(column_name||':'||data_type, ', ' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name in ('building_types','planet_buildings','planet_defenses','planet_resources','planets','occupations') group by table_name;
\echo '=== building_types ==='
select id, code, name, max_level, coalesce(image_url,'') from building_types order by id;
\echo '=== occ planet ==='
select o.id, o.planet_id, o.garrison_fleet_id from occupations o where status='active';
\echo '=== occ buildings ==='
select bt.code, pb.level from occupations o join planet_buildings pb on pb.planet_id=o.planet_id join building_types bt on bt.id=pb.building_type_id where o.status='active' order by bt.id;
\echo '=== occ defenses ==='
select pd.* from occupations o join planet_defenses pd on pd.planet_id=o.planet_id where o.status='active';
\echo '=== occ res ==='
select pr.* from occupations o join planet_resources pr on pr.planet_id=o.planet_id where o.status='active';
\echo '=== existing fn ==='
select proname from pg_proc where pronamespace='public'::regnamespace and proname like '%occupation%' order by 1;
SQL
