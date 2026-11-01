# Sistema de Puntos y Ranking - Documentacion de Migracion Backend

## Descripcion General

El sistema de puntos mide el progreso de cada jugador basandose en el valor de sus edificios, tecnologias, naves, defensas y expediciones. El ranking ordena a todos los jugadores segun sus puntos totales, creando una tabla de clasificacion competitiva.

---

## Categorias de Puntos

### Puntos de Edificios

Calculados por el costo acumulado de todos los edificios construidos.

### Puntos de Investigacion

Calculados por el costo acumulado de todas las tecnologias investigadas.

### Puntos de Flota

Calculados por el valor de todas las naves (en planetas + en vuelo).

### Puntos de Defensa

Calculados por el valor de todas las defensas construidas.

### Puntos de Expedicion

Puntos extra ganados por expediciones exitosas.

### Puntos Totales

```
puntos_totales = puntos_edificios + puntos_investigacion + puntos_flota + puntos_defensa + puntos_expedicion
```

---

## Formula de Calculo de Puntos

### Formula Base

```
puntos = (metal + cristal + deuterio) / 1000
```

Para cada unidad (edificio, tecnologia, nave, defensa), se suman los costos de todos los niveles construidos.

### Ejemplo: Edificio

**Mina de Metal nivel 10:**
```
costo_acumulado = suma de (costo_nivel_1 + costo_nivel_2 + ... + costo_nivel_10)

Para cada nivel i:
  metal = 60 * (1.5)^(i-1)
  cristal = 15 * (1.5)^(i-1)

costo_total_metal = 60 * (1 + 1.5 + 2.25 + ... + 38.44) = ~1,735
costo_total_cristal = 15 * (1 + 1.5 + ... + 38.44) = ~434

puntos_mina_metal_10 = (1735 + 434 + 0) / 1000 = ~2.17 puntos
```

### Ejemplo: Tecnologia

**Tecnologia de Armas nivel 5:**
```
Para cada nivel i:
  metal = 800 * (2.0)^(i-1)
  cristal = 200 * (2.0)^(i-1)

costo_total = suma de niveles 1 a 5
puntos = costo_total / 1000
```

### Ejemplo: Naves

**100 Cruceros:**
```
costo_crucero = 20000 metal + 7000 cristal + 2000 deuterio = 29000
puntos = 100 * 29000 / 1000 = 2,900 puntos
```

---

## Calculo de Puntos de Flota (Incluye Flotas en Vuelo)

### Logica

Los puntos de flota incluyen:
1. Naves estacionadas en todos los planetas
2. Naves en flotas en transito

```sql
puntos_flota = (
  SELECT SUM(
    (naves.cantidad * (nave_tipo.costo_metal + nave_tipo.costo_cristal + nave_tipo.costo_deuterio)) / 1000
  )
  FROM planet_ships naves
  JOIN ship_types nave_tipo ON nave_tipo.id = naves.ship_type_id
  WHERE naves.planet_id IN (SELECT id FROM planets WHERE user_id = p_user_id)
)
+
(
  SELECT COALESCE(SUM(
    (fs.quantity * (st.base_metal + st.base_crystal + st.base_deuterium)) / 1000
  ), 0)
  FROM fleets f
  JOIN fleet_ships fs ON fs.fleet_id = f.id
  JOIN ship_types st ON st.id = fs.ship_type_id
  WHERE f.user_id = p_user_id
    AND f.status IN ('traveling', 'returning')
);
```

---

## Funcion: update_user_points

### Proposito

Recalcular todos los puntos de un usuario y actualizar su perfil.

### Proceso

**Paso 1: Calcular Puntos de Edificios**
```
Para cada planeta del usuario:
    Para cada edificio con nivel > 0:
        calcular costo acumulado de todos los niveles
        sumar a puntos_edificios
```

**Paso 2: Calcular Puntos de Investigacion**
```
Para cada tecnologia del usuario con nivel > 0:
    calcular costo acumulado de todos los niveles
    sumar a puntos_investigacion
```

**Paso 3: Calcular Puntos de Flota**
```
Para cada planeta:
    Para cada tipo de nave:
        puntos += cantidad * costo_nave / 1000

Para cada flota en vuelo:
    Para cada nave en la flota:
        puntos += cantidad * costo_nave / 1000
```

**Paso 4: Calcular Puntos de Defensa**
```
Para cada planeta:
    Para cada tipo de defensa:
        puntos += cantidad * costo_defensa / 1000
```

**Paso 5: Sumar Puntos de Expedicion**
```
puntos_expedicion = valor almacenado en profiles
```

**Paso 6: Actualizar Perfil**
```sql
UPDATE profiles
SET
  building_points = puntos_edificios,
  research_points = puntos_investigacion,
  fleet_points = puntos_flota,
  defense_points = puntos_defensa,
  expedition_points = puntos_expedicion,
  total_points = puntos_edificios + puntos_investigacion + puntos_flota + puntos_defensa + puntos_expedicion
WHERE id = p_user_id;
```

---

## Sistema de Ranking

### Tabla: user_rankings

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| user_id | UUID | Usuario |
| rank | INTEGER | Posicion en ranking |
| total_points | BIGINT | Puntos totales |
| previous_rank | INTEGER | Posicion anterior |
| updated_at | TIMESTAMP | Ultima actualizacion |

### Actualizacion del Ranking

**Funcion: update_all_rankings**

```sql
WITH ranked_users AS (
  SELECT
    id,
    total_points,
    ROW_NUMBER() OVER (ORDER BY total_points DESC, created_at ASC) as new_rank
  FROM profiles
  WHERE is_banned = false
)
UPDATE user_rankings ur
SET
  previous_rank = ur.rank,
  rank = ru.new_rank,
  total_points = ru.total_points,
  updated_at = now()
FROM ranked_users ru
WHERE ur.user_id = ru.id;
```

### Frecuencia de Actualizacion

El ranking se actualiza:
- Cada hora via cron job
- Despues de eventos significativos (combates grandes)

---

## Ranking de Alianzas

### Calculo

```
puntos_alianza = suma de puntos_totales de todos los miembros
```

### Tabla: alliance_rankings

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| alliance_id | UUID | Alianza |
| rank | INTEGER | Posicion |
| total_points | BIGINT | Puntos totales |
| member_count | INTEGER | Cantidad de miembros |
| updated_at | TIMESTAMP | Ultima actualizacion |

---

## Proteccion Noob Basada en Puntos

### Limites

```
limite_noob = 5000 puntos
ratio_maximo = 5
```

### Verificacion

```
Si defensor.puntos < limite_noob Y atacante.puntos >= limite_noob:
    No permitir ataque

Si atacante.puntos / defensor.puntos > ratio_maximo:
    No permitir ataque (defensor muy debil)
```

---

## Estadisticas de Combate

### Campos en Profiles

| Campo | Descripcion |
|-------|-------------|
| battles_won | Batallas ganadas |
| battles_lost | Batallas perdidas |
| battles_drawn | Empates |
| units_destroyed | Unidades enemigas destruidas |
| units_lost | Unidades propias perdidas |

### Actualizacion Post-Combate

```sql
-- Actualizar estadisticas del atacante
UPDATE profiles
SET
  battles_won = battles_won + (1 si victoria),
  battles_lost = battles_lost + (1 si derrota),
  battles_drawn = battles_drawn + (1 si empate),
  units_destroyed = units_destroyed + unidades_enemigas_destruidas,
  units_lost = units_lost + unidades_propias_perdidas
WHERE id = atacante_id;

-- Igual para el defensor (invirtiendo win/loss)
```

---

## Hall of Fame

### Categorias

1. **Mas Puntos** - Top jugadores por puntos totales
2. **Mas Batallas** - Top jugadores por batallas ganadas
3. **Mas Unidades Destruidas** - Top por unidades destruidas
4. **Mejor Alianza** - Top alianzas por puntos

### Funcion: get_hall_of_fame

```sql
-- Top por puntos
SELECT username, total_points, rank
FROM profiles
JOIN user_rankings ON profiles.id = user_rankings.user_id
ORDER BY total_points DESC
LIMIT 10;

-- Top por batallas
SELECT username, battles_won
FROM profiles
WHERE battles_won > 0
ORDER BY battles_won DESC
LIMIT 10;
```

---

## Eventos que Actualizan Puntos

| Evento | Puntos Afectados |
|--------|------------------|
| Completar edificio | +building_points |
| Demoler edificio | -building_points |
| Completar investigacion | +research_points |
| Construir naves | +fleet_points |
| Perder naves en combate | -fleet_points |
| Construir defensas | +defense_points |
| Perder defensas en combate | -defense_points (parcial, 70% se reconstruye) |
| Expedicion exitosa | +expedition_points |

---

## Trigger de Actualizacion

### Opcion 1: Trigger Automatico

```sql
CREATE TRIGGER update_points_on_building_complete
AFTER UPDATE ON planet_buildings
FOR EACH ROW
WHEN (NEW.level > OLD.level)
EXECUTE FUNCTION trigger_update_user_points();
```

### Opcion 2: Actualizacion Explicita

Llamar a `update_user_points(user_id)` despues de cada operacion relevante.

**Preferido:** Opcion 2 para mejor control y rendimiento.

---

## Consideraciones de Rendimiento

### Indices Recomendados

```sql
CREATE INDEX idx_profiles_total_points ON profiles(total_points DESC);
CREATE INDEX idx_user_rankings_rank ON user_rankings(rank ASC);
CREATE INDEX idx_alliances_total_points ON alliances(total_points DESC);
```

### Caching

- El ranking no necesita ser en tiempo real
- Actualizar cada hora es suficiente
- Mostrar "Actualizado hace X minutos"

---

## Consideraciones de Seguridad

### Validaciones

1. **Nunca permitir edicion directa** de puntos
2. **Recalcular siempre en backend** basado en datos reales
3. **Auditar cambios grandes** de puntos (posible exploit)
4. **Verificar integridad** periodicamente

### Deteccion de Anomalias

```
Si cambio_puntos > umbral_sospechoso:
    Registrar para revision
    Posible multicuenta o exploit
```
