SELECT proname FROM pg_proc WHERE proname LIKE '%reload%' OR proname LIKE '%schema_cache%';
