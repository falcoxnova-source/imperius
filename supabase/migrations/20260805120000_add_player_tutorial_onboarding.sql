/*
  # Tutorial de onboarding para jugadores nuevos

  1. Nuevas columnas en `profiles`
     - `tutorial_step` (smallint) — paso actual del tutorial guiado
     - `tutorial_completed` (boolean) — si ya lo termino/salto (no vuelve a salir)

  2. Jugadores existentes
     - Se marcan como completado para que el tutorial solo aparezca a cuentas nuevas.

  3. Nueva funcion
     - `set_tutorial_progress(p_step, p_completed)` — guarda el progreso del propio
       usuario. SECURITY DEFINER para tocar unicamente las columnas del tutorial.
       Una vez completado nunca se revierte a falso.
*/

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tutorial_step smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tutorial_completed boolean NOT NULL DEFAULT false;

-- Los jugadores que ya existen no necesitan el tutorial de inicio
UPDATE public.profiles
SET tutorial_completed = true
WHERE tutorial_completed = false;

CREATE OR REPLACE FUNCTION public.set_tutorial_progress(
  p_step integer,
  p_completed boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.profiles
  SET tutorial_step = GREATEST(0, LEAST(COALESCE(p_step, 0), 100)),
      tutorial_completed = tutorial_completed OR COALESCE(p_completed, false),
      updated_at = now()
  WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tutorial_progress(integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_tutorial_progress(integer, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
