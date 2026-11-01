# Sistema de Planetas - Documentacion de Migracion Backend

## Descripcion General

El sistema de planetas es el nucleo fundamental del juego. Cada jugador comienza con un planeta natal y puede expandirse colonizando nuevos planetas. Los planetas son la base donde se construyen edificios, se producen recursos y se albergan naves y defensas.

---

## Estructura de Datos

### Tabla: planets

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | Identificador unico del planeta |
| user_id | UUID | Propietario del planeta |
| name | TEXT | Nombre del planeta |
| galaxy | INTEGER | Coordenada de galaxia (1-5) |
| system | INTEGER | Coordenada de sistema (1-499) |
| position | INTEGER | Posicion orbital (1-15, 16 para expedicion) |
| planet_type | TEXT | Tipo: 'planet', 'moon', 'debris' |
| diameter | INTEGER | Diametro en km |
| fields_used | INTEGER | Campos ocupados por edificios |
| fields_max | INTEGER | Campos maximos disponibles |
| min_temp | INTEGER | Temperatura minima |
| max_temp | INTEGER | Temperatura maxima |
| is_homeworld | BOOLEAN | Si es planeta natal |
| created_at | TIMESTAMP | Fecha de creacion |

---

## Formulas de Generacion de Planetas

### 1. Calculo de Campos Maximos

**Formula:**
```
campos_base = floor((diametro / 1000)^2)
campos_max = max(40, campos_base + bonus_posicion)
```

**Bonus por Posicion:**
| Posicion | Bonus |
|----------|-------|
| 1 | -30 |
| 2 | -20 |
| 3 | -10 |
| 4-9 | 0 |
| 10 | +5 |
| 11 | +10 |
| 12 | +15 |
| 13 | +20 |
| 14 | +15 |
| 15 | +10 |

**Terraformer (adicional):**
```
campos_extra = 5 * nivel_terraformer
```

### 2. Calculo de Diametro

**Formula base por posicion:**
| Posicion | Diametro Base |
|----------|---------------|
| 1-3 | 8000 - 10000 |
| 4-6 | 10000 - 12000 |
| 7-9 | 12000 - 14000 |
| 10-12 | 13000 - 15000 |
| 13-15 | 11000 - 16000 |

**Varianza:** +/- 2000 km aleatorio

### 3. Calculo de Temperatura

**Formula:**
```
temp_base = temperatura_por_posicion[posicion]
varianza = random(-20, +20)
max_temp = temp_base + varianza
min_temp = max_temp - 40
```

**Temperatura base por posicion:**
| Posicion | Temp Base |
|----------|-----------|
| 1 | 220 |
| 2 | 170 |
| 3 | 120 |
| 4 | 70 |
| 5 | 60 |
| 6 | 50 |
| 7 | 40 |
| 8 | 30 |
| 9 | 20 |
| 10 | 10 |
| 11 | 0 |
| 12 | -10 |
| 13 | -50 |
| 14 | -90 |
| 15 | -130 |

---

## Proceso de Creacion de Planeta Inicial

### Paso 1: Trigger al Registrar Usuario

Cuando un usuario se registra, el trigger `handle_new_user` ejecuta:

1. Crea perfil del usuario en tabla `profiles`
2. Llama a funcion `create_initial_planet(user_id)`

### Paso 2: Funcion create_initial_planet

**Logica paso a paso:**

1. **Buscar posicion disponible:**
   - Seleccionar galaxia aleatoria (1-5)
   - Seleccionar sistema aleatorio (1-499)
   - Seleccionar posicion aleatoria (4-12, preferidas para nuevos)
   - Verificar que coordenadas no esten ocupadas
   - Si ocupadas, buscar siguiente posicion disponible

2. **Generar caracteristicas:**
   - Calcular diametro segun posicion
   - Calcular temperatura segun posicion
   - Calcular campos maximos

3. **Insertar planeta:**
   - Crear registro en tabla `planets`
   - Marcar como `is_homeworld = true`

4. **Inicializar recursos:**
   - Crear registro en `planet_resources` con:
     - Metal: 500
     - Cristal: 500
     - Deuterio: 0
     - last_update: now()

5. **Crear edificios base:**
   - Insertar todos los tipos de edificios con nivel 0
   - Mina de Metal nivel 0
   - Mina de Cristal nivel 0
   - Sintetizador de Deuterio nivel 0
   - Planta Solar nivel 0
   - etc.

---

## Colonizacion de Nuevos Planetas

### Requisitos

1. **Nave Colonizadora** disponible en flota
2. **Posicion valida** (1-15, no ocupada)
3. **Slots de colonia disponibles:**
   ```
   max_colonias = floor((nivel_astrofisica + 1) / 2)
   ```

### Proceso de Colonizacion

**Paso 1: Validacion en envio de flota**
- Verificar nave colonizadora en flota
- Verificar coordenadas destino libres
- Verificar slots disponibles

**Paso 2: Llegada de flota**
- Destruir nave colonizadora
- Crear nuevo planeta con caracteristicas aleatorias
- Transferir recursos de carga al nuevo planeta
- Inicializar edificios base nivel 0

**Paso 3: Asignacion de recursos iniciales**
```
metal_inicial = 0 (solo lo que traia la nave)
cristal_inicial = 0
deuterio_inicial = 0
```

---

## Sistema de Lunas

### Creacion de Luna (Post-Combate)

**Probabilidad de creacion:**
```
probabilidad = min(20, max(0, floor((debris_metal + debris_crystal) / 100000)))
```

**Caracteristicas de luna:**
```
diametro = 8000 + (probabilidad * 100) + varianza
campos_max = floor((diametro / 1000)^2 * 0.5)
```

### Edificios Exclusivos de Luna

1. **Base Lunar** - Proporciona campos adicionales
2. **Falanges de Sensores** - Permite escanear flotas
3. **Portal de Salto** - Teletransporte instantaneo entre lunas

---

## Validaciones del Backend

### Al Crear Planeta

1. Coordenadas dentro de limites (1-5 galaxias, 1-499 sistemas, 1-15 posiciones)
2. Coordenadas no ocupadas por otro planeta
3. Usuario tiene slots de colonia disponibles
4. Usuario no esta en modo vacaciones

### Al Eliminar Planeta

1. No se puede eliminar planeta natal
2. No se puede eliminar si hay flotas en transito hacia el planeta
3. Todas las flotas del planeta deben retornar primero

---

## Funciones RPC de Supabase

### get_available_coordinates(galaxy, system)

**Proposito:** Obtener posiciones libres en un sistema

**Logica:**
1. Consultar todas las posiciones ocupadas en el sistema
2. Retornar array de posiciones 1-15 no ocupadas

### create_colony(user_id, galaxy, system, position)

**Proposito:** Crear nueva colonia

**Logica:**
1. Validar slots disponibles
2. Validar coordenadas libres
3. Generar caracteristicas del planeta
4. Insertar en tabla planets
5. Inicializar recursos y edificios
6. Actualizar contador de colonias del usuario

### abandon_planet(planet_id)

**Proposito:** Abandonar una colonia

**Logica:**
1. Verificar que no es planeta natal
2. Verificar que no hay flotas en camino
3. Eliminar todos los edificios del planeta
4. Eliminar recursos del planeta
5. Eliminar naves y defensas
6. Eliminar el planeta
7. Actualizar contador de colonias

---

## Consideraciones de Seguridad

### RLS (Row Level Security)

```sql
-- Solo el propietario puede ver sus planetas
CREATE POLICY "Users can view own planets"
  ON planets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Solo el propietario puede actualizar sus planetas
CREATE POLICY "Users can update own planets"
  ON planets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Validaciones Criticas

1. **Nunca confiar en datos del cliente** para coordenadas
2. **Siempre verificar en backend** disponibilidad de slots
3. **Usar transacciones** para operaciones atomicas
4. **Bloquear filas** durante colonizacion para evitar race conditions
