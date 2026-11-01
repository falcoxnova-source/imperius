Q() { docker exec -i xnova-database psql -U postgres -d postgres -At -c "$1" < /dev/null; }
Q "select pg_get_functiondef('public.fleet_calc_ship_speed'::regproc)"
