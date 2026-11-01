CREATE OR REPLACE FUNCTION public.cron_promote_orphan_research()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_promoted integer := 0;
BEGIN
  FOR v_uid IN
    SELECT DISTINCT rq.user_id
      FROM research_queue rq
     WHERE rq.status IN ('queued','pending')
       AND NOT EXISTS (
             SELECT 1 FROM user_technologies ut
              WHERE ut.user_id = rq.user_id
                AND ut.is_researching = true
           )
  LOOP
    BEGIN
      IF promote_next_queued_research(v_uid) THEN
        v_promoted := v_promoted + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cron_promote_orphan_research: usuario %: %', v_uid, SQLERRM;
    END;
  END LOOP;

  RETURN v_promoted;
END;
$function$

