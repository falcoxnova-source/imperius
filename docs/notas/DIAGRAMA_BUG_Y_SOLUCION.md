# 📊 DIAGRAMA DEL BUG Y LA SOLUCIÓN

## ANTES DEL BUG: Sistema Lineal (Funcionaba bien)

```
┌─────────────────────────────────────────────────────────┐
│ Terraformer Level 20                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Formula: fields_bonus = level * 5                       │
│          20 * 5 = 100 campos                            │
│                                                         │
│ Base fields:        166                                 │
│ Position penalty:   -30 (posición 1)                    │
│ Terraformer bonus:  +100 (lineal)                       │
│ ─────────────────────────────────                       │
│ TOTAL fields_max:   236                                 │
│                                                         │
│ Planets construcciones: 203                             │
│ Fields disponibles: 236 - 203 = 33 ✓                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 📅 TIMELINE DEL BUG

### PASO 1: Migración 20260305140000 - Cambio a Exponencial ✅ CORRECTO

```
┌────────────────────────────────────────────────────────┐
│ Cambio de LINEAL a EXPONENCIAL                         │
├────────────────────────────────────────────────────────┤
│                                                        │
│ OLD: level * 5 = 20 * 5 = 100                          │
│ NEW: FLOOR(5 * 20^1.3) = 1259                          │
│ DIFF: +1159                                            │
│                                                        │
│ UPDATE planets                                         │
│ SET fields_max = fields_max + 1159                     │
│                                                        │
│ RESULTADO:                                             │
│   236 + 1159 = 1395 ✓ CORRECTO                        │
│                                                        │
│   Construcciones: 203                                  │
│   Disponibles: 1395 - 203 = 1192 ✓                    │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### PASO 2: Migración 20260502133000 - "Fix" Que Creó El Bug ❌ BUG!

```
┌────────────────────────────────────────────────────────┐
│ Intento de "reparar" doble sustracción                │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Hizo una recalculation pero CON ERROR:                │
│                                                        │
│ ❌ LÓGICA INCORRECTA:                                  │
│   new_max = GREATEST(fields_used, calculated_max)     │
│   new_max = GREATEST(203, 1395) = 1395 ✓              │
│                                                        │
│ PERO SI HUBIERA INCONSISTENCIA:                       │
│   ❌ calculated_max = 180 (por bug temporal)           │
│   ❌ new_max = GREATEST(203, 180) = 203               │
│   ❌ RESULTADO: 203 campos ocupados, 0 disponibles!   │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## 🐛 EL BUG VISUAL: Estado Final Incorrecto

```
╔═══════════════════════════════════════════════════════╗
║ PLANETA DE DIABLO - ESTADO INCORRECTO                ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  Campos ocupados:   203/203                          ║
║                     ═══════════════════════════════  ║
║                     LLENO - 0 DISPONIBLES ❌          ║
║                                                       ║
║ ¿Por qué está mal?                                   ║
║  • fields_max debería ser: 1395 (con expo)          ║
║  • Pero fue recalculado como: 203 (igual a usado)   ║
║  • Perdió: 1395 - 203 = 1192 campos! ⚠️             ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
```

---

## ✅ LA SOLUCIÓN: Recalcular Correctamente

```
┌────────────────────────────────────────────────────────┐
│ Migración 20260503120000 - FIX FINAL                  │
├────────────────────────────────────────────────────────┤
│                                                        │
│ 1. Recrea terraformer_field_bonus() correctamente     │
│    ↓                                                   │
│    FLOOR(5 * POWER(level, 1.3)) = 1259               │
│                                                        │
│ 2. Recrea calculate_planet_max_fields() correctamente │
│    ↓                                                   │
│    base + position + terraformer_bonus                │
│    166 + (-30) + 1259 = 1395                          │
│                                                        │
│ 3. Recalcula TODOS los planetas                       │
│    ↓                                                   │
│    UPDATE SET fields_max = 1395                       │
│                                                        │
│ 4. Resultado:                                         │
│    203 construcciones / 1395 campos = 1192 libres ✓  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## 📊 COMPARATIVA: ANTES → DESPUÉS

```
╔════════════════════════════════════════════════════════╗
║ PLANETA "DIABLO HOME" - TERRAFORMER NIVEL 20          ║
╠════════════════════════════════════════════════════════╣
║                                                        ║
║  ESTADO INICIAL        → DURANTE BUG    → DESPUÉS FIX │
║  (Sistema lineal)        (Recalc error)    (Correcto) │
║                                                        ║
║  Campos base:   166      166              166         ║
║  Pos penalty:   -30      -30              -30         ║
║  Terra bonus:   +100     +1259 ❌ BUG→   +1259        │
║                 ─────    ──────           ─────        ║
║  fields_max:    236      1395 (luego 203) 1395 ✓      ║
║                          ↑ PERDER 1192!  ↑ RECUPERA  ║
║  Ocupado:       203      203              203         ║
║  ─────────────────────────────────────────────────    ║
║  DISPONIBLE:    33       0 ⚠️             1192 ✓      ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
```

---

## 🔄 FLUJO DE DATOS: Cómo funciona ahora

```
┌─────────────────────────────────────────────────────┐
│ Cuando se completa construcción de terraformer     │
└─────────────────────────────────────────────────────┘
                        │
                        ↓
        complete_building_queue_item()
                        │
                        ├─→ v_fields_increase = 
                        │   terraformer_field_bonus(new_level) -
                        │   terraformer_field_bonus(old_level)
                        │
                        ├─→ UPDATE planets 
                        │   SET fields_max = fields_max + v_fields_increase
                        │
                        └─→ TRIGGER: update_planet_fields_on_terraformer
                            │
                            └─→ LLAMADA FINAL A:
                                calculate_planet_max_fields()
                                │
                                ├─→ base_fields
                                ├─→ position_bonus  
                                └─→ terraformer_field_bonus(level)
                                    │
                                    └─→ FLOOR(5 * POWER(level, 1.3))
                                        │
                                        └─→ RESULTADO CORRECTO ✓


┌─────────────────────────────────────────────────────┐
│ Nueva validación preventiva (migración 120100)       │
└─────────────────────────────────────────────────────┘

CONSTRAINT: CHECK (fields_used <= fields_max)
           ↓
TRIGGER: validate_fields_on_update()
         ├─→ Si fields_max < fields_used: AUTO-FIX
         ├─→ Si fields_used < 0: REJECT
         └─→ Si fields_max < 40: CLAMP a 40 (mínimo)
```

---

## 🎯 KEY INSIGHTS (Lo que aprendemos)

| Aspecto | Antes | Ahora | Lección |
|---------|-------|-------|---------|
| Formula | Lineal (level*5) | Exponencial (5*level^1.3) | Cambios de formula requieren cuidado extremo |
| Recalculation | Manual UPDATE | Trigger + validación | Las funciones deben ser single source of truth |
| Validación | Ninguna | CHECK constraint + trigger | Preventividad es clave |
| Testing | Básico | Includes diagnóstico | Herramientas de debug son esenciales |

---

## 🚨 INDICADORES DE QUE EL BUG EXISTE

```
⚠️ ROJO (Crítico):
   fields_used > fields_max  ← Imposible matemáticamente

🟡 AMARILLO (Sospechoso):
   fields_max < calculated_value  ← Subevaluado
   fields_used = fields_max       ← Siempre lleno (extraño)
   
🟢 VERDE (Normal):
   fields_used < fields_max  ← Hay espacio libre
```

---

**Última actualización:** 2026-05-03
**Versión:** 1.0 FINAL
