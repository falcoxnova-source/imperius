# Sistema de Combate - Documentacion de Migracion Backend

## Descripcion General

El sistema de combate de XNova es uno de los mas complejos del juego. Simula batallas entre flotas atacantes y defensores (naves + defensas) utilizando un sistema de rondas, fuego rapido y dano aleatorio. El resultado determina quien gana, las perdidas de ambos lados, los escombros generados y el botin capturado.

---

## Mecanica General del Combate

### Fases del Combate

1. **Inicializacion:** Cargar unidades de atacantes y defensores
2. **Rondas de Combate:** Maximo 6 rondas
3. **Resolucion:** Calcular perdidas, escombros y botin
4. **Post-Combate:** Reconstruccion de defensas, creacion de luna

### Resultado Posible

- **Victoria Atacante:** Defensor sin unidades restantes
- **Victoria Defensor:** Atacante sin unidades restantes
- **Empate:** Ambos tienen unidades tras 6 rondas

---

## Estadisticas de Combate con Tecnologia

### Formulas de Estadisticas

**Poder de Armas:**
```
armas_finales = armas_base * (1 + nivel_armas * 0.10)
```

**Poder de Escudo:**
```
escudo_final = escudo_base * (1 + nivel_escudos * 0.10)
```

**Puntos de Casco:**
```
casco_final = casco_base * (1 + nivel_blindaje * 0.10)
```

### Ejemplo

**Crucero con Armas 10, Escudos 8, Blindaje 10:**
```
armas = 400 * (1 + 10 * 0.10) = 400 * 2.0 = 800
escudo = 50 * (1 + 8 * 0.10) = 50 * 1.8 = 90
casco = 27000 * (1 + 10 * 0.10) = 27000 * 2.0 = 54000
```

---

## Simulacion de Combate (Rondas)

### Estructura de una Ronda

```
Para cada ronda (1 a 6):
    1. Para cada unidad atacante:
        - Seleccionar objetivo aleatorio del defensor
        - Calcular dano
        - Aplicar fuego rapido
        - Aplicar dano al objetivo

    2. Para cada unidad defensora:
        - Seleccionar objetivo aleatorio del atacante
        - Calcular dano
        - Aplicar fuego rapido
        - Aplicar dano al objetivo

    3. Eliminar unidades destruidas (casco <= 0)

    4. Verificar condicion de fin:
        - Si atacante sin unidades: Victoria Defensor
        - Si defensor sin unidades: Victoria Atacante

    5. Regenerar escudos al 100% para siguiente ronda
```

### Aplicacion de Dano

```
// Primero, dano al escudo
dano_escudo = min(dano, escudo_actual)
escudo_actual = escudo_actual - dano_escudo
dano_restante = dano - dano_escudo

// Luego, dano al casco (si hay dano restante)
casco_actual = casco_actual - dano_restante

// Verificar destruccion
Si casco_actual <= 0:
    Unidad destruida
```

### Absorcion de Escudo

Los escudos absorben hasta su valor total de dano. El dano excedente pasa al casco.

```
Si dano <= escudo_actual:
    escudo_actual = escudo_actual - dano
    casco intacto
Si no:
    dano_al_casco = dano - escudo_actual
    escudo_actual = 0
    casco_actual = casco_actual - dano_al_casco
```

---

## Sistema de Fuego Rapido

### Mecanica

El fuego rapido permite a ciertas naves disparar multiples veces por ronda:

```
despues_de_cada_disparo:
    Si nave tiene fuego rapido contra objetivo:
        probabilidad = (valor_fuego_rapido - 1) / valor_fuego_rapido
        Si random() < probabilidad:
            Disparar de nuevo al mismo tipo de objetivo
```

### Ejemplo

**Crucero con Fuego Rapido 6 contra Caza Ligero:**
```
probabilidad = (6 - 1) / 6 = 83.3%

Disparo 1: Impacta
    83.3% chance de disparar de nuevo...
    Disparo 2: Impacta
        83.3% chance de disparar de nuevo...
        Disparo 3: Impacta
            83.3% chance de disparar de nuevo...
            (continua hasta fallar el roll)
```

### Tabla de Fuego Rapido (Resumen)

**Naves vs Naves:**
| Atacante | Objetivo | Valor |
|----------|----------|-------|
| Crucero | Caza Ligero | 6 |
| Acorazado | Caza Pesado | 4 |
| Acorazado | Crucero | 4 |
| Acorazado | Nave Batalla | 7 |
| Destructor | Acorazado | 2 |
| Estrella Muerte | Todo | 5-250 |

**Naves vs Defensas:**
| Atacante | Objetivo | Valor |
|----------|----------|-------|
| Crucero | Lanzamisiles | 10 |
| Bombardero | Laser Ligero | 20 |
| Bombardero | Laser Pesado | 10 |
| Bombardero | Canon Gauss | 5 |

---

## Calculo de Escombros

### Formula

```
escombros_metal = suma(metal_costo_unidad_destruida) * 0.30
escombros_cristal = suma(cristal_costo_unidad_destruida) * 0.30
```

**Factor de escombros:** 30%

**Nota:** El deuterio NO genera escombros.

### Ejemplo

**10 Cruceros destruidos:**
```
costo_crucero = 20000 metal, 7000 cristal
escombros_metal = 10 * 20000 * 0.30 = 60000
escombros_cristal = 10 * 7000 * 0.30 = 21000
```

### Campo de Escombros

Si ya existe un campo en las coordenadas, se suma:
```sql
UPDATE debris_fields
SET
  metal = metal + escombros_metal,
  crystal = crystal + escombros_cristal
WHERE galaxy = g AND system = s AND position = p;
```

Si no existe, se crea:
```sql
INSERT INTO debris_fields (galaxy, system, position, metal, crystal)
VALUES (g, s, p, escombros_metal, escombros_cristal);
```

---

## Calculo de Botin

### Formula

El atacante victorioso puede saquear hasta el 50% de los recursos del defensor:

```
capacidad_flota = suma(capacidad_nave * cantidad_sobreviviente)
recursos_defensor = metal + cristal + deuterio

botin_maximo = recursos_defensor * 0.50
botin_real = min(botin_maximo, capacidad_flota)
```

### Distribucion del Botin

```
total_recursos = metal + cristal + deuterio
proporcion_metal = metal / total_recursos
proporcion_cristal = cristal / total_recursos
proporcion_deuterio = deuterio / total_recursos

metal_saqueado = botin_real * proporcion_metal
cristal_saqueado = botin_real * proporcion_cristal
deuterio_saqueado = botin_real * proporcion_deuterio
```

---

## Reconstruccion de Defensas

### Mecanica

Despues del combate, las defensas destruidas tienen 70% de probabilidad de reconstruirse:

```
Para cada defensa destruida:
    Si random() < 0.70:
        defensa.cantidad += 1 (reconstruida)
```

### Con Ingeniero

```
probabilidad_reconstruccion = 0.70 + (0.30 * 0.50) = 0.85
```

**Nota:** Las naves NO se reconstruyen. Solo las defensas.

---

## Creacion de Luna

### Probabilidad

La probabilidad de crear una luna depende del total de escombros:

```
probabilidad_luna = min(20, max(0, floor((escombros_metal + escombros_cristal) / 100000)))
```

**Maximo:** 20%

### Caracteristicas de la Luna

```
diametro = 8000 + (probabilidad * 100) + random(-100, 100)
campos = floor((diametro / 1000)^2 * 0.5)
```

### Proceso de Creacion

```
Si random() * 100 < probabilidad_luna:
    Crear luna en las coordenadas del combate
    Notificar al defensor
```

---

## Funcion: simulate_xnova_combat

### Parametros

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| p_attackers | JSONB | Array de flotas atacantes |
| p_defenders | JSONB | Naves y defensas del defensor |

### Estructura de Entrada (Atacantes)

```json
[
  {
    "user_id": "uuid",
    "ships": [
      {"type_id": "cruiser", "quantity": 100},
      {"type_id": "battleship", "quantity": 50}
    ],
    "weapons_tech": 10,
    "shields_tech": 8,
    "armour_tech": 10
  }
]
```

### Estructura de Entrada (Defensores)

```json
{
  "ships": [
    {"type_id": "light_fighter", "quantity": 500},
    {"type_id": "cruiser", "quantity": 100}
  ],
  "defenses": [
    {"type_id": "rocket_launcher", "quantity": 1000},
    {"type_id": "plasma_turret", "quantity": 50}
  ],
  "weapons_tech": 8,
  "shields_tech": 7,
  "armour_tech": 8
}
```

### Estructura de Salida

```json
{
  "result": "attacker_win",
  "rounds": 4,
  "attacker_losses": {
    "cruiser": 15,
    "battleship": 5
  },
  "defender_losses": {
    "light_fighter": 500,
    "cruiser": 100,
    "rocket_launcher": 800,
    "plasma_turret": 30
  },
  "debris": {
    "metal": 450000,
    "crystal": 180000
  },
  "loot": {
    "metal": 500000,
    "crystal": 300000,
    "deuterium": 100000
  },
  "defender_rebuilt": {
    "rocket_launcher": 560,
    "plasma_turret": 21
  },
  "moon_created": false,
  "moon_chance": 6
}
```

---

## Proceso Completo de Combate

### Paso 1: Preparacion

```
1. Obtener flota atacante (naves de la flota)
2. Obtener tecnologias del atacante
3. Obtener naves del defensor (del planeta)
4. Obtener defensas del defensor (del planeta)
5. Obtener tecnologias del defensor
```

### Paso 2: Construir Arrays de Unidades

```
Para cada nave/defensa:
    unidad = {
        tipo: tipo_id,
        cantidad: cantidad_original,
        armas: armas_base * (1 + nivel_armas * 0.10),
        escudo: escudo_base * (1 + nivel_escudos * 0.10),
        casco: casco_base * (1 + nivel_blindaje * 0.10),
        escudo_actual: escudo (regenera cada ronda),
        casco_actual: casco
    }
```

### Paso 3: Ejecutar Rondas

```
Para ronda = 1 hasta 6:
    // Atacantes disparan
    Para cada unidad_atacante:
        objetivo = seleccionar_aleatorio(defensores)
        dano = unidad_atacante.armas
        aplicar_dano(objetivo, dano)
        procesar_fuego_rapido(unidad_atacante, defensores)

    // Defensores disparan
    Para cada unidad_defensora:
        objetivo = seleccionar_aleatorio(atacantes)
        dano = unidad_defensora.armas
        aplicar_dano(objetivo, dano)
        procesar_fuego_rapido(unidad_defensora, atacantes)

    // Eliminar destruidos
    atacantes = filtrar(unidad => unidad.casco_actual > 0)
    defensores = filtrar(unidad => unidad.casco_actual > 0)

    // Regenerar escudos
    Para cada unidad en (atacantes + defensores):
        unidad.escudo_actual = unidad.escudo

    // Verificar fin
    Si atacantes vacio: retornar "defender_win"
    Si defensores vacio: retornar "attacker_win"

retornar "draw"
```

### Paso 4: Calcular Resultados

```
1. Contar perdidas de cada lado
2. Calcular escombros (30% de metal+cristal)
3. Si atacante gano: calcular botin (50% max)
4. Reconstruir defensas (70%)
5. Verificar creacion de luna
6. Generar reporte de batalla
```

### Paso 5: Aplicar Resultados

```sql
-- Actualizar naves del defensor
UPDATE planet_ships
SET quantity = cantidad_sobreviviente
WHERE planet_id = p_defender_planet_id;

-- Actualizar defensas del defensor
UPDATE planet_defenses
SET quantity = cantidad_sobreviviente + cantidad_reconstruida
WHERE planet_id = p_defender_planet_id;

-- Descontar recursos saqueados
UPDATE planet_resources
SET
  metal = metal - metal_saqueado,
  crystal = crystal - cristal_saqueado,
  deuterium = deuterium - deuterio_saqueado
WHERE planet_id = p_defender_planet_id;

-- Crear campo de escombros
INSERT INTO debris_fields ...;

-- Cargar botin en flota atacante
UPDATE fleets
SET
  metal = metal + metal_saqueado,
  crystal = crystal + cristal_saqueado,
  deuterium = deuterium + deuterio_saqueado
WHERE id = p_fleet_id;

-- Actualizar naves de la flota atacante
UPDATE fleet_ships
SET quantity = cantidad_sobreviviente
WHERE fleet_id = p_fleet_id;
```

---

## Sistema ACS (Combate Aliado)

### Mecanica

Multiples flotas pueden atacar juntas en ACS:

```
slots_acs = min(5, 1 + floor(nivel_alianza / 2))
```

### Tiempo de Espera ACS

```
tiempo_espera = tiempo_vuelo_flota_mas_lenta * 0.30
```

### Combate ACS

```
1. Todas las flotas ACS se combinan como un solo atacante
2. Las tecnologias se calculan individualmente por flota
3. El botin se reparte proporcionalmente a la capacidad
4. Las perdidas se reparten proporcionalmente
```

---

## Reportes de Batalla

### Informacion del Reporte

```json
{
  "battle_id": "uuid",
  "timestamp": "2024-01-01T10:00:00Z",
  "coordinates": "[1:100:5]",
  "attacker": {
    "username": "Atacante",
    "units_initial": {...},
    "units_lost": {...},
    "technologies": {...}
  },
  "defender": {
    "username": "Defensor",
    "units_initial": {...},
    "units_lost": {...},
    "technologies": {...}
  },
  "rounds": [...],
  "result": "attacker_win",
  "debris": {...},
  "loot": {...},
  "moon_created": false
}
```

---

## Consideraciones de Seguridad

### Validaciones

1. **Nunca simular combate en cliente** - Solo backend
2. **Usar semillas aleatorias seguras** - No predecibles
3. **Verificar propiedad de flotas** - Siempre
4. **Bloquear durante combate** - Evitar race conditions
5. **Validar integridad de datos** - Pre y post combate

### RLS

```sql
CREATE POLICY "Users can view battles they participated in"
  ON battle_reports FOR SELECT
  TO authenticated
  USING (
    attacker_id = auth.uid() OR defender_id = auth.uid()
  );
```
