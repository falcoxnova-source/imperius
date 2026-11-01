/*
  # Correccion de Politicas RLS

  ## Descripcion
  Esta migracion corrige las politicas RLS que estaban causando conflictos,
  especialmente en la tabla de perfiles donde habia dos politicas SELECT
  en conflicto.

  ## Cambios
  1. Elimina politicas duplicadas de profiles
  2. Crea una politica unificada para SELECT en profiles
  3. Asegura que las politicas de INSERT esten correctas
*/

-- Eliminar politicas existentes de profiles para recrearlas
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view other profiles for ranking" ON profiles;

-- Crear politica unificada para SELECT (todos los usuarios autenticados pueden ver perfiles)
CREATE POLICY "Authenticated users can view profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Asegurar que INSERT funcione correctamente
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Corregir politica de planets para permitir INSERT durante registro
DROP POLICY IF EXISTS "Users can insert own planets" ON planets;
CREATE POLICY "Users can insert own planets"
  ON planets FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Corregir politica de planet_resources
DROP POLICY IF EXISTS "Users can insert own planet resources" ON planet_resources;
CREATE POLICY "Users can insert own planet resources"
  ON planet_resources FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.id = planet_id
      AND planets.user_id = auth.uid()
    )
  );
