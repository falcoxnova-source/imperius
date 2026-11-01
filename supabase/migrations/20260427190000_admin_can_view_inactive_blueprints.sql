/*
  # Permitir a admins ver TODOS los planos (incluido is_active=false)

  La policy actual "Blueprint catalog visible to authenticated" solo
  expone filas con is_active=true, lo cual oculta los planos desactivados
  incluso del panel de admin.

  Solucion: anadir una policy adicional que permita a profiles.is_admin
  ver todas las filas. Las policies en PostgreSQL son OR entre si para
  SELECT, asi que con cualquiera que pase, se ve la fila.
*/

DROP POLICY IF EXISTS "Admins can view all blueprints" ON ship_blueprints;

CREATE POLICY "Admins can view all blueprints"
  ON ship_blueprints
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_admin, false) = true
    )
  );
