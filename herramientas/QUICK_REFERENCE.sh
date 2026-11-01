#!/usr/bin/env bash
# QUICK REFERENCE - Comandos rápidos para aplicar la solución

# ============================================================================
# OPCIÓN 1: Aplicar vía Supabase UI (Más seguro para inicio)
# ============================================================================

# 1. Abre: https://app.supabase.com/
# 2. Selecciona proyecto: hhrgcnvydmjqcevgmlhj
# 3. Va a: SQL Editor
# 4. Pega el contenido de esta migración:
#    supabase/migrations/20260503120000_fix_terraformer_exponential_formula.sql
# 5. Click "Run" y espera < 5 segundos
# 6. Repite con la otra migración:
#    supabase/migrations/20260503120100_add_field_validation_preventive.sql

# ============================================================================
# OPCIÓN 2: Aplicar vía Supabase CLI (Si tienes instalado)
# ============================================================================

# cd "d:\Falco-Xnova Bolt Supabase"
# 
# # Push las migraciones
# npx supabase db push
# 
# # Espera confirmación de ambas migraciones

# ============================================================================
# OPCIÓN 3: Aplicar vía psql (CLI de PostgreSQL)
# ============================================================================

# PGPASSWORD='Jfs.samsung1989*' psql \
#   -h 'avs-1-eu-north-1.pooler.supabase.com' \
#   -p 6543 \
#   -U 'postgres.shgchydmjrjgcgmll' \
#   -d 'postgres' \
#   -f 'supabase/migrations/20260503120000_fix_terraformer_exponential_formula.sql'

# ============================================================================
# VALIDACIÓN RÁPIDA (Ejecutar DESPUÉS de aplicar)
# ============================================================================

# SQL para copiar y pegar en SQL Editor:

-- 1. Verificar que no hay overflow
SELECT 'PASO 1: Verificar overflow' as test;
SELECT COUNT(*) as planets_with_overflow
FROM planets
WHERE user_id IS NOT NULL 
  AND planet_type = 'planet'
  AND fields_used > fields_max;
-- Expected: 0

-- 2. Verificar terraformer_field_bonus
SELECT 'PASO 2: Validar terraformer_field_bonus' as test;
SELECT 
  public.terraformer_field_bonus(1) as level_1,
  public.terraformer_field_bonus(5) as level_5,
  public.terraformer_field_bonus(20) as level_20;
-- Expected: 5, 40, 1259

-- 3. Buscar planeta de Diablo
SELECT 'PASO 3: Verificar Diablo' as test;
SELECT 
  pr.username,
  p.name,
  p.fields_used || '/' || p.fields_max as campos,
  (p.fields_max - p.fields_used) as libres
FROM planets p
LEFT JOIN profiles pr ON pr.id = p.user_id
WHERE pr.username ILIKE 'diablo%'
  AND p.planet_type = 'planet'
LIMIT 5;
-- Expected: Debe mostrar campos aumentados vs antes del fix

-- 4. Resumen general
SELECT 'PASO 4: Resumen General' as test;
SELECT
  COUNT(*) FILTER (WHERE fields_used > fields_max) as overflow,
  COUNT(*) FILTER (WHERE fields_used = fields_max) as full,
  COUNT(*) FILTER (WHERE fields_used < fields_max) as available,
  COUNT(*) as total
FROM planets
WHERE user_id IS NOT NULL AND planet_type = 'planet';

-- 5. Ver problemas pendientes (si los hay)
SELECT 'PASO 5: Problemas Pendientes' as test;
SELECT * FROM public.list_field_problems() LIMIT 10;
-- Expected: Sin resultados = TODO OK ✓

# ============================================================================
# TROUBLESHOOTING
# ============================================================================

-- Si falla el trigger:
SELECT trigger_name 
FROM information_schema.triggers 
WHERE trigger_name = 'trigger_update_fields_on_terraformer';
-- Debe retornar 1 fila

-- Si terraformer_field_bonus no existe:
SELECT prosrc FROM pg_proc 
WHERE proname = 'terraformer_field_bonus'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
-- Debe retornar la función

-- Si quieres ver qué cambió en un planeta:
SELECT 
  p.id,
  p.name,
  p.fields_used,
  p.fields_max,
  (p.fields_max - p.fields_used) as available,
  pb.level as terra_level,
  public.terraformer_field_bonus(pb.level) as terra_bonus
FROM planets p
LEFT JOIN planet_buildings pb ON p.id = pb.planet_id
LEFT JOIN building_types bt ON pb.building_type_id = bt.id
WHERE bt.code = 'terraformer' AND pb.level > 0
ORDER BY pb.level DESC
LIMIT 10;

# ============================================================================
# DOCUMENTACIÓN DISPONIBLE
# ============================================================================

# RESUMEN_SOLUCION_FINAL.md
#   → Resumen ejecutivo (leer PRIMERO)
#
# GUIA_APLICACION_FIX_TERRAFORMER.md  
#   → Paso a paso detallado (GUÍA PRINCIPAL)
#
# README_TERRAFORMER_FIX.md
#   → Explicación técnica completa
#
# DIAGRAMA_BUG_Y_SOLUCION.md
#   → Visuales del problema y solución
#
# TERRAFORMER_BUG_ANALYSIS.sql
#   → Análisis técnico profundo
#
# VALIDATE_TERRAFORMER_FIX.sql
#   → Script de validación completo

# ============================================================================
# ARCHIVOS CLAVE
# ============================================================================

# supabase/migrations/20260503120000_fix_terraformer_exponential_formula.sql
#   → LA MIGRACIÓN PRINCIPAL (CRÍTICA)
#   → Aplica ESTA PRIMERO
#   → Tiempo: < 5 segundos
#
# supabase/migrations/20260503120100_add_field_validation_preventive.sql  
#   → LA MIGRACIÓN PREVENTIVA (RECOMENDADA)
#   → Aplica ESTA SEGUNDA
#   → Tiempo: 1-2 segundos

# ============================================================================
# CHECKLIST DE VERIFICACIÓN
# ============================================================================

# ☐ Leer RESUMEN_SOLUCION_FINAL.md
# ☐ Leer GUIA_APLICACION_FIX_TERRAFORMER.md
# ☐ Ejecutar migración 20260503120000
# ☐ Ejecutar migración 20260503120100
# ☐ Ejecutar "PASO 1: Verificar overflow" (debe retornar 0)
# ☐ Ejecutar "PASO 2: Validar terraformer_field_bonus"
# ☐ Buscar planeta de Diablo y verificar que campos aumentaron
# ☐ Ejecutar "PASO 5: Problemas Pendientes" (debe estar vacío)
# ☐ Notificar a jugadores sobre la corrección
# ☐ DONE! ✅

# ============================================================================
