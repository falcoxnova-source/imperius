CREATE OR REPLACE FUNCTION public.trg_promote_research_queue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Nunca puede romper el cierre de la investigacion: si la promocion
  -- falla por cualquier motivo, se registra y se sigue adelante.
  BEGIN
    IF EXISTS (
      SELECT 1 FROM research_queue
      WHERE user_id = NEW.user_id AND status IN ('queued', 'pending')
      LIMIT 1
    ) THEN
      PERFORM promote_next_queued_research(NEW.user_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'promote_research_queue fallo para %: %', NEW.user_id, SQLERRM;
  END;

  RETURN NULL;
END;
$function$

