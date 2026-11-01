-- ============================================================================
-- KYC (Know Your Customer) — verificación de identidad
-- Fecha: 2026-05-13
-- ----------------------------------------------------------------------------
-- El usuario envía: nombre/identidad, tipo y número de documento, foto del
-- documento y selfie sosteniendo el documento. Un admin aprueba o rechaza.
-- Imágenes en bucket privado `kyc-documents` bajo `{user_id}/...`.
-- ============================================================================

-- 1) Columna de estado rápido en profiles ------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_kyc_status_chk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_kyc_status_chk
      CHECK (kyc_status IN ('none','pending','approved','rejected'));
  END IF;
END $$;

-- 2) Tabla kyc_verifications -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kyc_verifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name           text NOT NULL,
  document_type       text NOT NULL CHECK (document_type IN ('passport','national_id','drivers_license','other')),
  document_number     text NOT NULL,
  country_code        text,
  date_of_birth       date,
  document_photo_path text NOT NULL,
  selfie_photo_path   text NOT NULL,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_id            uuid REFERENCES public.profiles(id),
  admin_notes         text,
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  reviewed_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kyc_status ON public.kyc_verifications (status, submitted_at DESC);

-- 3) RLS ---------------------------------------------------------------------
ALTER TABLE public.kyc_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kyc_select_own_or_admin" ON public.kyc_verifications;
CREATE POLICY "kyc_select_own_or_admin" ON public.kyc_verifications
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );
-- Escrituras solo vía RPC SECURITY DEFINER (sin políticas INSERT/UPDATE/DELETE).

-- El rol authenticated necesita el privilegio base SELECT (la RLS filtra filas).
GRANT SELECT ON public.kyc_verifications TO authenticated;

-- 4) Bucket privado kyc-documents -------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "kyc_docs_read"   ON storage.objects;
DROP POLICY IF EXISTS "kyc_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "kyc_docs_delete" ON storage.objects;

-- Lectura: el dueño (primer segmento del path = su user_id) o un admin.
CREATE POLICY "kyc_docs_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'kyc-documents'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
    )
  );

-- Subida: solo el propio usuario en su carpeta {user_id}/...
CREATE POLICY "kyc_docs_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND owner = auth.uid()
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Borrado: el dueño o un admin.
CREATE POLICY "kyc_docs_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'kyc-documents'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
    )
  );

-- 5) RPC: envío de KYC por el usuario ---------------------------------------
CREATE OR REPLACE FUNCTION public.kyc_submit(
  p_full_name       text,
  p_document_type   text,
  p_document_number text,
  p_document_photo_path text,
  p_selfie_photo_path   text,
  p_country_code    text DEFAULT NULL,
  p_date_of_birth   date DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_kyc_id uuid;
  v_current text;
  v_doctype text := lower(coalesce(p_document_type,''));
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  IF length(trim(coalesce(p_full_name,''))) < 3 THEN
    RAISE EXCEPTION 'Nombre completo invalido';
  END IF;
  IF v_doctype NOT IN ('passport','national_id','drivers_license','other') THEN
    RAISE EXCEPTION 'Tipo de documento invalido';
  END IF;
  IF length(trim(coalesce(p_document_number,''))) < 3 THEN
    RAISE EXCEPTION 'Numero de documento invalido';
  END IF;
  IF coalesce(p_document_photo_path,'') = '' OR coalesce(p_selfie_photo_path,'') = '' THEN
    RAISE EXCEPTION 'Debes subir la foto del documento y la selfie con el documento';
  END IF;

  -- Los archivos deben estar bajo la carpeta del propio usuario.
  IF split_part(p_document_photo_path,'/',1) <> v_user_id::text
     OR split_part(p_selfie_photo_path,'/',1) <> v_user_id::text THEN
    RAISE EXCEPTION 'Rutas de archivo invalidas';
  END IF;

  SELECT status INTO v_current FROM kyc_verifications WHERE user_id = v_user_id;
  IF v_current = 'approved' THEN
    RAISE EXCEPTION 'Tu verificacion KYC ya esta aprobada';
  END IF;

  INSERT INTO kyc_verifications (
    user_id, full_name, document_type, document_number, country_code,
    date_of_birth, document_photo_path, selfie_photo_path,
    status, admin_id, admin_notes, submitted_at, reviewed_at, updated_at
  ) VALUES (
    v_user_id, trim(p_full_name), v_doctype, trim(p_document_number), p_country_code,
    p_date_of_birth, p_document_photo_path, p_selfie_photo_path,
    'pending', NULL, NULL, now(), NULL, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name           = EXCLUDED.full_name,
    document_type       = EXCLUDED.document_type,
    document_number     = EXCLUDED.document_number,
    country_code        = EXCLUDED.country_code,
    date_of_birth       = EXCLUDED.date_of_birth,
    document_photo_path = EXCLUDED.document_photo_path,
    selfie_photo_path   = EXCLUDED.selfie_photo_path,
    status              = 'pending',
    admin_id            = NULL,
    admin_notes         = NULL,
    submitted_at        = now(),
    reviewed_at         = NULL,
    updated_at          = now()
  RETURNING id INTO v_kyc_id;

  UPDATE profiles SET kyc_status = 'pending' WHERE id = v_user_id;

  RETURN v_kyc_id;
END;
$function$;

-- 6) RPC: listar KYC (solo admin) -------------------------------------------
CREATE OR REPLACE FUNCTION public.kyc_admin_list(p_status text DEFAULT 'all')
 RETURNS TABLE (
   kyc_id uuid,
   user_id uuid,
   username text,
   email text,
   full_name text,
   document_type text,
   document_number text,
   country_code text,
   date_of_birth date,
   document_photo_path text,
   selfie_photo_path text,
   status text,
   admin_id uuid,
   admin_username text,
   admin_notes text,
   submitted_at timestamptz,
   reviewed_at timestamptz
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean := false;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    IF v_caller IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
    SELECT coalesce(is_admin,false) INTO v_is_admin FROM profiles WHERE id = v_caller;
    IF NOT v_is_admin THEN RAISE EXCEPTION 'Solo admin'; END IF;
  END IF;

  RETURN QUERY
  SELECT k.id, k.user_id, u.username, u.email, k.full_name, k.document_type,
         k.document_number, k.country_code, k.date_of_birth,
         k.document_photo_path, k.selfie_photo_path, k.status,
         k.admin_id, a.username, k.admin_notes, k.submitted_at, k.reviewed_at
    FROM kyc_verifications k
    JOIN profiles u ON u.id = k.user_id
    LEFT JOIN profiles a ON a.id = k.admin_id
   WHERE (p_status = 'all' OR k.status = p_status)
   ORDER BY
     CASE WHEN k.status = 'pending' THEN 0 ELSE 1 END,
     k.submitted_at DESC;
END;
$function$;

-- 7) RPC: aprobar/rechazar KYC (solo admin) ---------------------------------
CREATE OR REPLACE FUNCTION public.kyc_admin_review(
  p_kyc_id  uuid,
  p_approve boolean,
  p_notes   text DEFAULT NULL
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean := false;
  v_row kyc_verifications%ROWTYPE;
  v_new_status text;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    IF v_caller IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
    SELECT coalesce(is_admin,false) INTO v_is_admin FROM profiles WHERE id = v_caller;
    IF NOT v_is_admin THEN RAISE EXCEPTION 'Solo admin'; END IF;
  END IF;

  SELECT * INTO v_row FROM kyc_verifications WHERE id = p_kyc_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud KYC no existe'; END IF;

  IF p_approve AND coalesce(p_notes,'') = '' THEN
    -- notas opcionales al aprobar
    NULL;
  END IF;
  IF (NOT p_approve) AND length(trim(coalesce(p_notes,''))) < 3 THEN
    RAISE EXCEPTION 'Debes indicar el motivo del rechazo';
  END IF;

  v_new_status := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;

  UPDATE kyc_verifications
     SET status = v_new_status,
         admin_id = v_caller,
         admin_notes = p_notes,
         reviewed_at = now(),
         updated_at = now()
   WHERE id = p_kyc_id;

  UPDATE profiles SET kyc_status = v_new_status WHERE id = v_row.user_id;

  RETURN true;
END;
$function$;

-- 8) Permisos ----------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.kyc_submit(text,text,text,text,text,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kyc_admin_list(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kyc_admin_review(uuid,boolean,text) TO authenticated;
