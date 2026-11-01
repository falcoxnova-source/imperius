Q() { docker exec -i xnova-database psql -U postgres -d postgres -At -c "$1" < /dev/null; }
for f in purchase_market_listing galaxy_navigate fulfill_buy_offer; do
  Q "SELECT string_agg(pg_get_functiondef(p.oid), E'\n----\n') FROM pg_proc p WHERE p.proname='$f' AND p.prokind='f'"
done
