# 📋 INSTRUCCIONES DE APLICACIÓN - FIX TERRAFORMER

## ⚡ RESUMEN EJECUTIVO

**Problema:** Jugadores perdieron campos en sus planetas (ej: Diablo pasó de 213 disponibles a 0)

**Causa:** Bug en la fórmula de terraformer durante cambio de lineal a exponencial

**Solución:** 2 nuevas migraciones SQL que corrigen el problema de raíz

**Impacto:** ✅ Campos se recuperarán automáticamente
**Riesgo:** 🟢 BAJO - Solo recalculates, no modifica lógica de juego

---

## 🚀 PASO A PASO

### 1️⃣ APLICAR LA MIGRACIÓN PRINCIPAL (CRÍTICA)

**Archivo:** `supabase/migrations/20260503120000_fix_terraformer_exponential_formula.sql`

**En Supabase SQL Editor:**
```sql
-- Copy & paste entire migration file
-- Should complete in < 5 seconds
```

**Qué hace:**
- ✅ Recrea `terraformer_field_bonus()` correctamente
- ✅ Recrea `calculate_planet_max_fields()` con fórmula exponencial
- ✅ Recrea `update_planet_fields_on_terraformer()` trigger
- ✅ Recalcula `fields_max` para TODOS los planetas

**Validación:** Debería mostrar:
```
Query successful: completed in 2.3s
```

---

### 2️⃣ APLICAR LA MIGRACIÓN PREVENTIVA (RECOMENDADA)

**Archivo:** `supabase/migrations/20260503120100_add_field_validation_preventive.sql`

**En Supabase SQL Editor:**
```sql
-- Copy & paste entire migration file
```

**Qué hace:**
- 🔒 Agrega constraint `CHECK (fields_used <= fields_max)`
- 🔒 Agrega trigger de validación pre-insert/update
- 📊 Agrega función `diagnose_planet_fields()` para diagnosticar
- 📊 Agrega función `list_field_problems()` para listar problemas

**Validación:** Debería mostrar:
```
Query successful: completed in 1.2s
```

---

### 3️⃣ VALIDAR QUE FUNCIONÓ

**Ejecutar en Supabase SQL Editor:**

```sql
-- Verificar que no hay overflow
SELECT COUNT(*) as planets_with_overflow
FROM planets
WHERE user_id IS NOT NULL 
  AND planet_type = 'planet'
  AND fields_used > fields_max;

-- Debe retornar: 0
```

**Más detallado (ejecutar VALIDATE_TERRAFORMER_FIX.sql):**
```sql
-- Copy entire file and execute
-- Should show all PASS validations
```

---

### 4️⃣ VERIFICAR PLANETA ESPECÍFICO (DIABLO)

```sql
SELECT 
  p.id,
  p.name,
  p.fields_used,
  p.fields_max,
  (p.fields_max - p.fields_used) as free_fields,
  pb.level as terraformer_level
FROM planets p
LEFT JOIN profiles pr ON pr.id = p.user_id
LEFT JOIN planet_buildings pb ON p.id = pb.planet_id 
  AND pb.building_type_id = (SELECT id FROM building_types WHERE code = 'terraformer')
WHERE pr.username ILIKE 'diablo%'
  AND p.planet_type = 'planet'
ORDER BY p.created_at DESC;

-- Buscar la línea con el problema reportado
-- Debería mostrar: fields_max AUMENTÓ (ej: 203 → 213)
```

---

### 5️⃣ DIAGNOSTICAR PROBLEMAS ESPECÍFICOS

Si necesitas revisar un planeta específico:

```sql
-- Usar la nueva función de diagnóstico
SELECT jsonb_pretty(public.diagnose_planet_fields('PLANET_ID_HERE'::uuid));

-- Ejemplo output:
{
  "planet_id": "...",
  "planet_name": "Diablo Home",
  "fields_used": 203,
  "fields_max_current": 213,
  "fields_max_calculated": 213,
  "terraformer_level": 20,
  "terraformer_bonus": 1259,
  "status": "OK ✓",
  "free_fields": 10,
  "needs_recalc": false
}
```

---

### 6️⃣ LISTAR TODOS LOS PROBLEMAS PENDIENTES (POST-FIX)

```sql
SELECT * FROM public.list_field_problems();

-- Si retorna filas vacías: ✅ TODOS SOLUCIONADOS
-- Si retorna filas: requiere investigación manual
```

---

## 🔍 TROUBLESHOOTING

### ❌ Error: "function terraformer_field_bonus does not exist"

**Solución:** Ejecutar la migración principal primero (20260503120000)

### ❌ Algunos planetas aún tienen fields_used > fields_max

**Solución:** Ejecutar manualmente:
```sql
UPDATE planets p
SET fields_max = GREATEST(p.fields_used, public.calculate_planet_max_fields(p.id))
WHERE p.user_id IS NOT NULL 
  AND p.planet_type = 'planet'
  AND p.fields_used > p.fields_max;
```

### ❌ El trigger no recalcula cuando cambio terraformer

**Verificar:** Que el trigger existe:
```sql
SELECT trigger_name 
FROM information_schema.triggers 
WHERE trigger_name = 'trigger_update_fields_on_terraformer';

-- Debe retornar 1 fila
```

---

## 📊 ESTADÍSTICAS POST-FIX

Después de aplicar las migraciones, ejecutar:

```sql
WITH stats AS (
  SELECT
    COUNT(*) FILTER (WHERE fields_used > fields_max) as overflow_count,
    COUNT(*) FILTER (WHERE fields_used = fields_max) as full_count,
    COUNT(*) FILTER (WHERE fields_used < fields_max) as has_free_count,
    COUNT(*) as total_planets
  FROM planets
  WHERE user_id IS NOT NULL AND planet_type = 'planet'
)
SELECT
  overflow_count || ' planets with OVERFLOW' as status1,
  full_count || ' planets FULL (no free)' as status2,
  has_free_count || ' planets with FREE fields' as status3,
  total_planets || ' total planets' as status4
FROM stats;

-- Expected output:
-- | 0 planets with OVERFLOW
-- | (various) planets FULL (no free)
-- | (various) planets with FREE fields
-- | (total) total planets
```

---

## 🎯 ROLLBACK (Si es necesario)

Si necesitas revertir:

```sql
-- OPCIÓN 1: Revertir solo la migración preventiva
DROP TRIGGER IF EXISTS trigger_validate_fields_on_update ON planets;
DROP FUNCTION IF EXISTS public.validate_fields_on_update();
DROP FUNCTION IF EXISTS public.diagnose_planet_fields(uuid);
DROP FUNCTION IF EXISTS public.list_field_problems();
ALTER TABLE planets DROP CONSTRAINT IF EXISTS check_fields_used_within_max;

-- OPCIÓN 2: Revertir TODO (no recomendado - revertería fix también)
-- Contactar a equipo de DB
```

---

## ✅ CHECKLIST DE VERIFICACIÓN

- [ ] Migración 20260503120000 ejecutada sin errores
- [ ] Migración 20260503120100 ejecutada sin errores
- [ ] Validación SQL: `SELECT COUNT(*) ... fields_used > fields_max` retorna 0
- [ ] Planeta de Diablo verificado: campos aumentaron
- [ ] Función `diagnose_planet_fields()` disponible y funciona
- [ ] Función `list_field_problems()` retorna vacío (sin problemas)
- [ ] Team notificado sobre la corrección
- [ ] Documentación actualizada

---

## 📞 CONTACTO SI NECESITA AYUDA

**Documento de análisis:** [TERRAFORMER_BUG_ANALYSIS.sql](TERRAFORMER_BUG_ANALYSIS.sql)
**Documento explicativo:** [README_TERRAFORMER_FIX.md](README_TERRAFORMER_FIX.md)
**Script de validación:** [VALIDATE_TERRAFORMER_FIX.sql](VALIDATE_TERRAFORMER_FIX.sql)

---

## 📝 NOTAS TÉCNICAS

### Fórmula de cálculo de campos
```
fields_max = GREATEST(
  40,  -- mínimo
  base_fields + position_bonus + terraformer_bonus
)

Donde:
  base_fields = FLOOR((diameter / 1000)²)
  position_bonus = -30 to 20 (depende de posición)
  terraformer_bonus = FLOOR(5 * level^1.3)  ← La fórmula exponencial
```

### Ejemplo cálculo real
```
Planeta: diameter=12890, position=1, terraformer_level=20
  base_fields = FLOOR((12890/1000)²) = 166
  position_bonus = -30 (posición 1 es mala)
  terraformer_bonus = FLOOR(5 * 20^1.3) = 1259
  
  total = GREATEST(40, 166 - 30 + 1259) = 1395 campos máximo
```

---

**Última actualización:** 2026-05-03
**Estado:** ✅ LISTO PARA APLICAR
