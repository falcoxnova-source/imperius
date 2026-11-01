-- ============================================================================
-- Normaliza `profiles.avatar_url` a una ruta RELATIVA.
--
-- Motivo: los avatares se guardaban con la URL absoluta del dominio en el que
-- estaba el juego cuando se subieron (ej. https://tung.xnova.xyz/...). Al
-- cambiar de dominio esas URLs apuntan a un host muerto y las fotos dejan de
-- verse, aunque el fichero sigue existiendo en el bucket `avatars`.
--
-- Guardando solo `/storage/v1/object/public/avatars/...` el frontend la resuelve
-- contra el dominio actual y el problema no puede repetirse.
-- ============================================================================

BEGIN;

UPDATE public.profiles
SET avatar_url = substring(avatar_url from position('/storage/v1/object/' in avatar_url))
WHERE avatar_url IS NOT NULL
  AND avatar_url <> ''
  AND avatar_url LIKE 'http%'
  AND position('/storage/v1/object/' in avatar_url) > 0;

COMMIT;
