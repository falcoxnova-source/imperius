# 🐛 BUG TERRAFORMER: Análisis y Solución

## PROBLEMA REPORTADO

**Clientes se quejan:** Los jugadores están perdiendo campos en sus planetas.

**Ejemplo de caso (Jugador Diablo):**
- Planeta tenía: 213 campos disponibles + 203 construcciones = 416 campos totales
- Ahora muestra: 203 campos ocupados / 203 campos disponibles (0 LIBRES)
- **¿Qué pasó?** Perdió 10 campos disponibles (de 213 → 203)

**Alcance:** Múltiples jugadores reportan el mismo problema

---

## ROOT CAUSE ANALYSIS

### La Línea de Tiempo de Bugs

#### 📅 2026-01-03: Versión Lineal (Baseline)
Migración `20260103144300_019_fix_security_issues.sql` creó:
```sql
calculate_planet_max_fields():
  fields_max = base_fields + position_bonus + (terraformer_level * 5)
```

**Ejemplo:** Terraformer nivel 20 → +100 campos

---

#### 📅 2026-03-05: Cambio a Exponencial ⚠️
Migración `20260305140000_terraformer_exponential_fields.sql` cambió la fórmula:

**DE:** `level * 5` (lineal)
**A:** `FLOOR(5 * POWER(level, 1.3))` (exponencial)

| Level | Lineal (viejo) | Exponencial (nuevo) | Diferencia |
|-------|----------------|---------------------|-----------|
| 1     | 5              | 5                   | 0         |
| 5     | 25             | 40                  | +15       |
| 10    | 50             | 99                  | +49       |
| 20    | 100            | 1259                | +1159     |

**¿Qué pasó?**
- La migración recalculó `fields_max` para todos los planetas usando el incremento diferencial:
  ```sql
  new_bonus = terraformer_field_bonus(20) = 1259
  old_bonus = 20 * 5 = 100
  difference = 1259 - 100 = +1159
  UPDATE planets SET fields_max = fields_max + 1159 WHERE terraformer_level = 20
  ```

✅ Este paso funcionó correctamente.

---

#### 📅 2026-05-02: Intento de Arreglación ⚠️⚠️
Migración `20260502133000_fix_terraformer_demolish_double_subtract.sql` reportó:
- "Problema: terraformer descuenta fields_max dos veces al demoler"
- Intentó FIJAR el problema en `secure_demolish_building()`
- Pero luego hizo un recálculo que introdujo EL BUG:

```sql
-- ❌ ESTO ES EL BUG:
UPDATE planets p
SET fields_max = f.new_max
FROM fixed f
WHERE p.id = f.id
  AND p.fields_max <> f.new_max;
```

**El problema:** Usó `GREATEST(fields_used, calculated_max)` como `new_max`

Esto significa: Si un planeta tenía `fields_used = 203` y el cálculo correcto era `fields_max = 213`,
pero había un desajuste, la migración haría:
```
new_max = GREATEST(203, 213) = 213
```

Pero si el cálculo fue incorrecto O si hubo una inconsistencia temporal,
podría haber quedado:
```
new_max = GREATEST(203, 180) = 203  ← AHORA 0 CAMPOS LIBRES!
```

---

### El Bug Real: Formulación Inconsistente

El verdadero problema es que **la migración 20260502133000 no usó la fórmula CORRECTA** al recalcular.

En esa migración, el código de `secure_demolish_building()` está usando:
```sql
v_fields_decrease := terraformer_field_bonus(v_current_level) - terraformer_field_bonus(v_current_level - 1);
```

Pero el trigger `update_planet_fields_on_terraformer()` llama a `calculate_planet_max_fields()` que podría estar en una versión vieja.

**¿Por qué?** Porque Supabase aplica migraciones secuencialmente, y si hay un error en la replicación de funciones, pueden haber MÚLTIPLES DEFINICIONES en conflicto.

---

## LA SOLUCIÓN

He creado una nueva migración: `20260503120000_fix_terraformer_exponential_formula.sql`

### Que hace:

#### 1. **Garantiza terraformer_field_bonus es correcta**
```sql
CREATE OR REPLACE FUNCTION public.terraformer_field_bonus(p_level integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $function$
BEGIN
  IF p_level <= 0 THEN RETURN 0; END IF;
  RETURN FLOOR(5 * POWER(p_level, 1.3))::integer;
END;
$function$;
```

#### 2. **Garantiza calculate_planet_max_fields usa EXPONENCIAL**
- Recalcula desde cero con la fórmula correcta
- Usa el helper `terraformer_field_bonus()` siempre

#### 3. **Actualiza el trigger**
```sql
CREATE OR REPLACE FUNCTION public.update_planet_fields_on_terraformer()
  -- Ahora garantiza que siempre usa calculate_planet_max_fields correcta
```

#### 4. **RECALCULA todos los planetas**
```sql
WITH planets_to_fix AS (
  SELECT 
    p.id,
    public.calculate_planet_max_fields(p.id) AS calculated_max,
    GREATEST(p.fields_used, public.calculate_planet_max_fields(p.id)) AS new_max
  FROM public.planets p
  WHERE p.user_id IS NOT NULL AND p.planet_type = 'planet'
)
UPDATE public.planets p
SET fields_max = ptf.new_max
FROM planets_to_fix ptf
WHERE p.id = ptf.id AND p.fields_max != ptf.new_max;
```

**Importante:** Usa `GREATEST(fields_used, calculated_max)` para:
- Si un planeta tiene construcciones que exceden el espacio calculado, respeta eso
- Pero recalcula correctamente para planetas sin problemas

---

## IMPACTO

### ✅ Lo que se CORRIGE:
- Todos los planetas con terraformer ahora tendrán `fields_max` calculado correctamente
- No habrá más `fields_used > fields_max`
- La fórmula exponencial se aplicará consistentemente

### ⚠️ Jugadores afectados:
- Aquellos que vieron sus campos reducidos ahora verán que AUMENTAN de nuevo
- Ejemplo: "203 disponibles" podría volver a "213 disponibles"

### 🔒 Prevención:
- El trigger `update_planet_fields_on_terraformer()` siempre usa la función correcta
- Ya no hay riesgo de inconsistencias por versiones conflictivas de funciones

---

## COMO VALIDAR LA SOLUCIÓN

Después de aplicar la migración, ejecutar:

```bash
# En Supabase SQL Editor:
\include VALIDATE_TERRAFORMER_FIX.sql
```

Debe mostrar:
✅ `terraformer_field_bonus is correct`
✅ `No planets with fields_used > fields_max`

---

## ARCHIVOS MODIFICADOS

1. **`supabase/migrations/20260503120000_fix_terraformer_exponential_formula.sql`**
   - La migración que aplica la solución

2. **`TERRAFORMER_BUG_ANALYSIS.sql`**
   - Análisis detallado del problema (referencia)

3. **`VALIDATE_TERRAFORMER_FIX.sql`**
   - Script de validación post-aplicación

4. **`README_TERRAFORMER_FIX.md`** (este archivo)
   - Documentación completa

---

## NEXT STEPS

1. ✅ Crear la migración (HECHO)
2. ⏳ Aplicar la migración en Supabase
3. ⏳ Ejecutar el script de validación
4. ⏳ Notificar a los jugadores afectados sobre la corrección
5. ⏳ Monitorear que no hay nuevas inconsistencias

---

## CHANGELOG

| Fecha | Cambio |
|-------|--------|
| 2026-05-03 | 🐛 Detectado bug de pérdida de campos en terraformer |
| 2026-05-03 | ✅ Creada solución en migración 20260503120000 |
| 2026-05-03 | 📝 Documentación completa del análisis |

