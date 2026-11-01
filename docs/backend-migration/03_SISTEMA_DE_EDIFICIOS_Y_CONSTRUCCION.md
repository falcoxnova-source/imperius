# Sistema de Edificios y Construccion - Documentacion de Migracion Backend

## Descripcion General

El sistema de edificios permite a los jugadores construir y mejorar estructuras en sus planetas. Cada edificio tiene requisitos, costos y tiempos de construccion que aumentan exponencialmente con cada nivel. La construccion se maneja mediante un sistema de cola que permite encolar multiples edificios.

---

## Categorias de Edificios

### Edificios de Recursos

| ID | Nombre | Funcion |
|----|--------|---------|
| metal_mine | Mina de Metal | Produce metal |
| crystal_mine | Mina de Cristal | Produce cristal |
| deuterium_synthesizer | Sintetizador de Deuterio | Produce deuterio |
| solar_plant | Planta Solar | Produce energia |
| fusion_reactor | Reactor de Fusion | Produce energia, consume deuterio |

### Edificios de Almacenamiento

| ID | Nombre | Funcion |
|----|--------|---------|
| metal_storage | Almacen de Metal | Aumenta capacidad de metal |
| crystal_storage | Almacen de Cristal | Aumenta capacidad de cristal |
| deuterium_tank | Deposito de Deuterio | Aumenta capacidad de deuterio |

### Edificios de Instalaciones

| ID | Nombre | Funcion |
|----|--------|---------|
| robotics_factory | Fabrica de Robots | Reduce tiempo de construccion |
| shipyard | Astillero | Permite construir naves y defensas |
| research_lab | Laboratorio de Investigacion | Permite investigar tecnologias |
| alliance_depot | Deposito de la Alianza | Almacena flotas aliadas |
| missile_silo | Silo de Misiles | Almacena misiles |
| nanite_factory | Fabrica de Nanobots | Reduce drasticamente tiempos |
| terraformer | Terraformer | Aumenta campos del planeta |
| space_dock | Dique Espacial | Repara flotas |

### Edificios Exclusivos de Luna

| ID | Nombre | Funcion |
|----|--------|---------|
| lunar_base | Base Lunar | Proporciona campos en luna |
| sensor_phalanx | Falanges de Sensores | Escanea flotas enemigas |
| jump_gate | Portal de Salto | Teletransporta flotas |

---

## Formulas de Costos

### Formula General de Costo

```
costo_nivel = costo_base * (factor_costo)^(nivel_actual)
```

**Factor de costo estandar:** 1.5

### Costos Base por Edificio

| Edificio | Metal Base | Cristal Base | Deuterio Base | Factor |
|----------|------------|--------------|---------------|--------|
| Mina de Metal | 60 | 15 | 0 | 1.5 |
| Mina de Cristal | 48 | 24 | 0 | 1.6 |
| Sintetizador Deuterio | 225 | 75 | 0 | 1.5 |
| Planta Solar | 75 | 30 | 0 | 1.5 |
| Reactor de Fusion | 900 | 360 | 180 | 1.8 |
| Almacen de Metal | 1000 | 0 | 0 | 2.0 |
| Almacen de Cristal | 1000 | 500 | 0 | 2.0 |
| Deposito Deuterio | 1000 | 1000 | 0 | 2.0 |
| Fabrica de Robots | 400 | 120 | 200 | 2.0 |
| Astillero | 400 | 200 | 100 | 2.0 |
| Laboratorio | 200 | 400 | 200 | 2.0 |
| Fabrica Nanobots | 1000000 | 500000 | 100000 | 2.0 |
| Terraformer | 0 | 50000 | 100000 | 2.0 |
| Silo de Misiles | 20000 | 20000 | 1000 | 2.0 |
| Base Lunar | 20000 | 40000 | 20000 | 2.0 |
| Falanges | 20000 | 40000 | 20000 | 2.0 |
| Portal de Salto | 2000000 | 4000000 | 2000000 | 2.0 |

### Ejemplo de Calculo

**Mina de Metal nivel 10:**
```
metal = 60 * (1.5)^9 = 60 * 38.44 = 2,306
cristal = 15 * (1.5)^9 = 15 * 38.44 = 576
deuterio = 0
```

---

## Formulas de Tiempo de Construccion

### Formula General

```
tiempo_segundos = ((costo_metal + costo_cristal) / (2500 * (1 + nivel_robotica))) * 3600 / reduccion_nanobots / velocidad_juego
```

**Reduccion de Nanobots:**
```
reduccion_nanobots = 2^nivel_nanobots
```

### Con Bonus de Comandante (oficial)

El Comandante no reduce el tiempo, pero aumenta los slots de cola de 2 a 5.

### Ejemplo de Calculo

**Mina de Metal nivel 10 con Robotica 5 y Nanobots 2, velocidad x1:**
```
costo_total = 2306 + 576 = 2882
base_tiempo = 2882 / (2500 * 6) = 0.192 horas
con_nanobots = 0.192 / 4 = 0.048 horas
tiempo_final = 0.048 * 3600 = 173 segundos (2.88 minutos)
```

---

## Sistema de Requisitos

### Estructura de Requisitos

Cada edificio puede tener requisitos de:
- Otros edificios (nivel minimo)
- Tecnologias (nivel minimo)

### Tabla de Requisitos

| Edificio | Requisitos |
|----------|------------|
| Mina de Metal | Ninguno |
| Mina de Cristal | Ninguno |
| Sintetizador Deuterio | Ninguno |
| Planta Solar | Ninguno |
| Reactor de Fusion | Sintetizador Deuterio 5, Tecnologia Energia 3 |
| Fabrica de Robots | Ninguno |
| Astillero | Fabrica de Robots 2 |
| Laboratorio | Ninguno |
| Deposito Alianza | Ninguno |
| Silo de Misiles | Astillero 1 |
| Fabrica Nanobots | Fabrica de Robots 10, Computacion 10 |
| Terraformer | Fabrica Nanobots 1, Tecnologia Energia 12 |
| Base Lunar | Ninguno (solo en luna) |
| Falanges | Base Lunar 1 |
| Portal de Salto | Base Lunar 1, Tecnologia Hiperimpulsor 7 |

---

## Sistema de Cola de Construccion

### Estructura de la Cola

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico del item |
| planet_id | UUID | Planeta donde se construye |
| building_type_id | TEXT | Tipo de edificio |
| level | INTEGER | Nivel a construir |
| position | INTEGER | Posicion en la cola |
| start_time | TIMESTAMP | Cuando comienza la construccion |
| end_time | TIMESTAMP | Cuando termina |
| status | TEXT | 'pending', 'in_progress', 'completed' |

### Slots de Cola

- **Sin Comandante:** 2 slots
- **Con Comandante:** 5 slots

### Proceso de Agregar a la Cola

**Paso 1: Validacion de Requisitos**
```
1. Verificar que el edificio existe
2. Verificar que se cumplen todos los requisitos
3. Verificar que hay campos disponibles
4. Verificar que hay slots de cola disponibles
5. Verificar que hay recursos suficientes
```

**Paso 2: Calcular Tiempo**
```
1. Calcular costo del siguiente nivel
2. Calcular tiempo con bonificaciones
3. Si hay item en construccion, start_time = end_time del anterior
4. Si no hay nada en cola, start_time = now()
```

**Paso 3: Descontar Recursos**
```
1. Calcular y sincronizar recursos actuales
2. Descontar metal, cristal, deuterio
3. Actualizar planet_resources
```

**Paso 4: Insertar en Cola**
```sql
INSERT INTO building_queue (
  planet_id, building_type_id, level, position,
  start_time, end_time, status
) VALUES (...);
```

---

## Proceso de Completar Construccion

### Funcion: process_completed_building_queue

**Paso 1: Buscar Items Completados**
```sql
SELECT * FROM building_queue
WHERE planet_id = p_planet_id
  AND end_time <= now()
  AND status = 'in_progress'
ORDER BY end_time ASC
FOR UPDATE SKIP LOCKED;
```

**Paso 2: Para Cada Item Completado**
```
1. Incrementar nivel del edificio en planet_buildings
2. Incrementar fields_used en planets
3. Actualizar puntos del usuario
4. Eliminar item de la cola
5. Avanzar siguiente item a 'in_progress' si existe
```

**Paso 3: Recalcular Tiempos**
Si el item completado era una Fabrica de Robots o Nanobots:
```
Para cada item pendiente en la cola:
  Recalcular tiempo con nuevos bonos
  Actualizar end_time
```

---

## Cancelacion de Construccion

### Reglas de Cancelacion

1. Solo se puede cancelar el item actualmente en construccion
2. Se devuelve el 100% de los recursos
3. Los items siguientes avanzan en la cola

### Proceso de Cancelacion

**Paso 1: Verificar Permiso**
```
1. Verificar que el item existe
2. Verificar que pertenece al usuario
3. Verificar que esta en status 'in_progress'
```

**Paso 2: Calcular Devolucion**
```
metal_devolver = costo_metal_del_nivel
cristal_devolver = costo_cristal_del_nivel
deuterio_devolver = costo_deuterio_del_nivel
```

**Paso 3: Ejecutar Cancelacion**
```
1. Devolver recursos al planeta
2. Eliminar item de la cola
3. Si hay items pendientes, iniciar el siguiente
4. Recalcular end_times de la cola
```

---

## Validaciones del Backend

### Validacion de Campos

```
campos_usados = contar edificios con nivel > 0
campos_en_cola = contar items en cola
campos_totales = campos_usados + campos_en_cola

Si campos_totales >= campos_max:
    ERROR: "No hay campos disponibles"
```

### Validacion de Recursos

```
Sincronizar recursos actuales
Si metal < costo_metal O
   cristal < costo_cristal O
   deuterio < costo_deuterio:
    ERROR: "Recursos insuficientes"
```

### Validacion de Requisitos

```
Para cada requisito del edificio:
    Si requisito.tipo == 'building':
        nivel_actual = obtener nivel del edificio en planeta
    Si requisito.tipo == 'technology':
        nivel_actual = obtener nivel de tecnologia del usuario

    Si nivel_actual < requisito.nivel_requerido:
        ERROR: "Requisito no cumplido: {nombre} nivel {nivel_requerido}"
```

---

## Funcion RPC: secure_add_to_building_queue

### Parametros

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| p_planet_id | UUID | ID del planeta |
| p_building_type_id | TEXT | ID del tipo de edificio |

### Logica Completa

```
1. Verificar usuario autenticado
2. Verificar planeta pertenece al usuario
3. Verificar usuario no en modo vacaciones
4. Obtener nivel actual del edificio
5. Calcular siguiente nivel
6. Verificar requisitos
7. Verificar campos disponibles
8. Verificar slots de cola
9. Calcular costo del nivel
10. Sincronizar y verificar recursos
11. Descontar recursos
12. Calcular tiempo de construccion
13. Determinar start_time (ahora o despues del anterior)
14. Insertar en building_queue
15. Retornar datos del nuevo item
```

### Retorno

```json
{
  "success": true,
  "queue_id": "uuid",
  "building_type_id": "metal_mine",
  "level": 11,
  "start_time": "2024-01-01T10:00:00Z",
  "end_time": "2024-01-01T10:15:00Z",
  "cost_metal": 2306,
  "cost_crystal": 576,
  "cost_deuterium": 0
}
```

---

## Completar con FXU (Instantaneo)

### Formula de Costo FXU

```
costo_recursos = costo_metal + costo_cristal + costo_deuterio
costo_fxu = (costo_recursos / ratio_fxu_edificios) * factor_tiempo_restante
```

**Ratio por defecto:** 5000 (5000 FXU por cada 5000 recursos)

**Factor tiempo restante:**
```
tiempo_restante = end_time - now()
tiempo_total = end_time - start_time
factor = tiempo_restante / tiempo_total
```

### Proceso de Completar Instantaneamente

```
1. Verificar item en cola
2. Calcular costo FXU
3. Verificar balance FXU suficiente
4. Descontar FXU del usuario
5. Completar edificio inmediatamente
6. Actualizar puntos
7. Avanzar cola
8. Registrar transaccion de FXU
9. Contribuir porcentaje al jackpot
```

---

## Consideraciones de Seguridad

### RLS para building_queue

```sql
CREATE POLICY "Users can view own building queue"
  ON building_queue FOR SELECT
  TO authenticated
  USING (
    planet_id IN (SELECT id FROM planets WHERE user_id = auth.uid())
  );
```

### Prevencion de Race Conditions

```sql
SELECT * FROM building_queue
WHERE ...
FOR UPDATE SKIP LOCKED;
```

Esto evita que dos procesos procesen el mismo item simultaneamente.

### Validaciones Criticas

1. **Nunca confiar en tiempos del cliente**
2. **Siempre validar requisitos en backend**
3. **Usar transacciones para atomicidad**
4. **Bloquear filas durante procesamiento**
5. **Verificar propiedad del planeta siempre**
