# Sistema de Naves y Astillero - Documentacion de Migracion Backend

## Descripcion General

El sistema de naves permite a los jugadores construir una flota para explorar, atacar, transportar recursos y defender sus planetas. Las naves se construyen en el Astillero y cada tipo tiene caracteristicas unicas de velocidad, capacidad de carga, consumo de combustible y poder de combate.

---

## Categorias de Naves

### Naves Civiles

| ID | Nombre | Funcion Principal |
|----|--------|-------------------|
| small_cargo | Carguero Pequeno | Transporte de recursos |
| large_cargo | Carguero Grande | Transporte masivo |
| colony_ship | Nave Colonizadora | Colonizar planetas |
| recycler | Reciclador | Recolectar escombros |
| espionage_probe | Sonda de Espionaje | Espiar enemigos |

### Naves de Combate

| ID | Nombre | Rol en Combate |
|----|--------|----------------|
| light_fighter | Caza Ligero | Unidad basica |
| heavy_fighter | Caza Pesado | Combate medio |
| cruiser | Crucero | Anti-cazas |
| battleship | Nave de Batalla | Linea principal |
| battlecruiser | Acorazado | Interceptor |
| bomber | Bombardero | Anti-defensas |
| destroyer | Destructor | Capital |
| deathstar | Estrella de la Muerte | Superarma |

### Naves Especiales

| ID | Nombre | Funcion |
|----|--------|---------|
| pathfinder | Explorador | Expediciones |
| solar_satellite | Satelite Solar | Genera energia |
| star_destroyer | Destructor Estelar | Nave capital alternativa |
| black_moon | Luna Negra | Nave definitiva |

---

## Especificaciones de Naves

### Estadisticas Basicas

| Nave | Metal | Cristal | Deuterio | Casco | Escudo | Armas |
|------|-------|---------|----------|-------|--------|-------|
| Caza Ligero | 3000 | 1000 | 0 | 4000 | 10 | 50 |
| Caza Pesado | 6000 | 4000 | 0 | 10000 | 25 | 150 |
| Crucero | 20000 | 7000 | 2000 | 27000 | 50 | 400 |
| Nave de Batalla | 45000 | 15000 | 0 | 60000 | 200 | 1000 |
| Acorazado | 30000 | 40000 | 15000 | 70000 | 400 | 700 |
| Bombardero | 50000 | 25000 | 15000 | 75000 | 500 | 1000 |
| Destructor | 60000 | 50000 | 15000 | 110000 | 500 | 2000 |
| Estrella Muerte | 5000000 | 4000000 | 1000000 | 9000000 | 50000 | 200000 |
| Carguero Pequeno | 2000 | 2000 | 0 | 4000 | 10 | 5 |
| Carguero Grande | 6000 | 6000 | 0 | 12000 | 25 | 5 |
| Nave Colonizadora | 10000 | 20000 | 10000 | 30000 | 100 | 50 |
| Reciclador | 10000 | 6000 | 2000 | 16000 | 10 | 1 |
| Sonda Espionaje | 0 | 1000 | 0 | 1000 | 0 | 0 |
| Satelite Solar | 0 | 2000 | 500 | 2000 | 1 | 1 |
| Explorador | 8000 | 15000 | 8000 | 38000 | 300 | 200 |

### Velocidad y Consumo

| Nave | Velocidad Base | Motor | Consumo Base | Capacidad |
|------|----------------|-------|--------------|-----------|
| Caza Ligero | 12500 | Combustion | 20 | 50 |
| Caza Pesado | 10000 | Impulso | 75 | 100 |
| Crucero | 15000 | Impulso | 300 | 800 |
| Nave de Batalla | 10000 | Hiperimpulsor | 500 | 1500 |
| Acorazado | 10000 | Hiperimpulsor | 250 | 750 |
| Bombardero | 4000 | Impulso | 1000 | 500 |
| Destructor | 5000 | Hiperimpulsor | 1000 | 2000 |
| Estrella Muerte | 100 | Hiperimpulsor | 1 | 1000000 |
| Carguero Pequeno | 5000 | Combustion | 10 | 5000 |
| Carguero Grande | 7500 | Combustion | 50 | 25000 |
| Nave Colonizadora | 2500 | Impulso | 1000 | 7500 |
| Reciclador | 2000 | Combustion | 300 | 20000 |
| Sonda Espionaje | 100000000 | Combustion | 1 | 5 |
| Explorador | 12000 | Hiperimpulsor | 300 | 10000 |

---

## Formulas de Velocidad

### Por Tipo de Motor

**Motor de Combustion:**
```
velocidad_final = velocidad_base * (1 + nivel_combustion * 0.10)
```

**Motor de Impulso:**
```
velocidad_final = velocidad_base * (1 + nivel_impulso * 0.20)
```

**Motor de Hiperimpulsor:**
```
velocidad_final = velocidad_base * (1 + nivel_hiperimpulsor * 0.30)
```

### Ejemplo de Calculo

**Crucero con Motor Impulso nivel 8:**
```
velocidad = 15000 * (1 + 8 * 0.20)
velocidad = 15000 * 2.6
velocidad = 39000
```

---

## Sistema de Fuego Rapido

El fuego rapido permite a ciertas naves disparar multiples veces contra naves mas debiles.

### Mecanica

```
probabilidad_disparo_adicional = (valor_fuego_rapido - 1) / valor_fuego_rapido

Si nave tiene fuego rapido 5 contra objetivo:
    probabilidad = (5 - 1) / 5 = 80% de disparar de nuevo
```

### Tabla de Fuego Rapido

| Atacante | Objetivo | Valor |
|----------|----------|-------|
| Crucero | Caza Ligero | 6 |
| Crucero | Sonda Espionaje | 5 |
| Crucero | Misil Cohete | 10 |
| Nave Batalla | Sonda Espionaje | 5 |
| Acorazado | Carguero Pequeno | 3 |
| Acorazado | Carguero Grande | 3 |
| Acorazado | Caza Pesado | 4 |
| Acorazado | Crucero | 4 |
| Acorazado | Nave Batalla | 7 |
| Bombardero | Sonda Espionaje | 5 |
| Bombardero | Satelite Solar | 5 |
| Bombardero | Lanzamisiles | 20 |
| Bombardero | Laser Ligero | 20 |
| Bombardero | Laser Pesado | 10 |
| Bombardero | Canon Gauss | 5 |
| Bombardero | Canon Ionico | 10 |
| Bombardero | Canon Plasma | 5 |
| Destructor | Sonda Espionaje | 5 |
| Destructor | Satelite Solar | 5 |
| Destructor | Acorazado | 2 |
| Destructor | Laser Ligero | 10 |
| Estrella Muerte | Carguero Pequeno | 250 |
| Estrella Muerte | Carguero Grande | 250 |
| Estrella Muerte | Caza Ligero | 200 |
| Estrella Muerte | Caza Pesado | 100 |
| Estrella Muerte | Crucero | 33 |
| Estrella Muerte | Nave Batalla | 30 |
| Estrella Muerte | Acorazado | 15 |
| Estrella Muerte | Bombardero | 15 |
| Estrella Muerte | Destructor | 5 |
| Estrella Muerte | Sonda Espionaje | 1250 |
| Estrella Muerte | Satelite Solar | 1250 |
| Estrella Muerte | Reciclador | 250 |
| Estrella Muerte | Lanzamisiles | 200 |
| Estrella Muerte | Laser Ligero | 200 |
| Estrella Muerte | Laser Pesado | 100 |
| Estrella Muerte | Canon Gauss | 50 |
| Estrella Muerte | Canon Ionico | 100 |

---

## Requisitos de Construccion

### Tabla de Requisitos

| Nave | Requisitos |
|------|------------|
| Caza Ligero | Astillero 1 |
| Caza Pesado | Astillero 3, Blindaje 2, Impulso 2 |
| Crucero | Astillero 5, Impulso 4, Ionica 2 |
| Nave de Batalla | Astillero 7, Hiperimpulsor 4 |
| Acorazado | Astillero 8, Hiperimpulsor 5, Hiperespacio 5, Laser 12 |
| Bombardero | Astillero 8, Impulso 6, Plasma 5 |
| Destructor | Astillero 9, Hiperimpulsor 6, Hiperespacio 5 |
| Estrella Muerte | Astillero 12, Hiperimpulsor 7, Hiperespacio 6, Graviton 1 |
| Carguero Pequeno | Astillero 2, Combustion 2 |
| Carguero Grande | Astillero 4, Combustion 6 |
| Nave Colonizadora | Astillero 4, Impulso 3 |
| Reciclador | Astillero 4, Combustion 6, Escudos 2 |
| Sonda Espionaje | Astillero 3, Combustion 3, Espionaje 2 |
| Satelite Solar | Astillero 1 |
| Explorador | Astillero 5, Impulso 4, Escudos 4 |

---

## Formula de Tiempo de Construccion

### Formula General

```
tiempo_segundos = ((costo_metal + costo_cristal) / (2500 * (1 + nivel_astillero))) * 3600 / reduccion_nanobots / velocidad_juego
```

**Reduccion Nanobots:**
```
reduccion = 2^nivel_nanobots
```

### Tiempo para Multiples Unidades

```
tiempo_total = tiempo_por_unidad * cantidad
```

---

## Sistema de Cola del Astillero

### Estructura de la Cola

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico |
| planet_id | UUID | Planeta de construccion |
| item_type | TEXT | 'ship' o 'defense' |
| type_id | TEXT | ID del tipo de nave |
| quantity | INTEGER | Cantidad a construir |
| start_time | TIMESTAMP | Inicio de construccion |
| end_time | TIMESTAMP | Fin de construccion |
| status | TEXT | 'pending', 'in_progress', 'completed' |

### Proceso de Agregar a Cola

**Paso 1: Validacion**
```
1. Verificar planeta tiene astillero nivel >= requisito
2. Verificar requisitos de tecnologia
3. Verificar recursos suficientes para cantidad solicitada
4. Verificar planeta pertenece al usuario
```

**Paso 2: Calcular Costo Total**
```
costo_metal = costo_base_metal * cantidad
costo_cristal = costo_base_cristal * cantidad
costo_deuterio = costo_base_deuterio * cantidad
```

**Paso 3: Calcular Tiempo**
```
tiempo_por_unidad = formula_tiempo_construccion
tiempo_total = tiempo_por_unidad * cantidad
```

**Paso 4: Descontar y Encolar**
```sql
-- Descontar recursos
UPDATE planet_resources SET
  metal = metal - costo_metal,
  crystal = crystal - costo_cristal,
  deuterium = deuterium - costo_deuterio
WHERE planet_id = p_planet_id;

-- Insertar en cola
INSERT INTO shipyard_queue (
  planet_id, item_type, type_id, quantity,
  start_time, end_time, status
) VALUES (...);
```

---

## Proceso de Completar Construccion

### Funcion: process_completed_shipyard_queue

**Paso 1: Buscar Items Completados**
```sql
SELECT * FROM shipyard_queue
WHERE planet_id = p_planet_id
  AND end_time <= now()
  AND status = 'in_progress'
FOR UPDATE SKIP LOCKED;
```

**Paso 2: Para Cada Item**
```
1. Verificar que el item existe en planet_ships o planet_defenses
2. Incrementar cantidad de unidades
3. Actualizar puntos del usuario
4. Eliminar item de la cola
5. Avanzar siguiente item si existe
```

**Paso 3: Actualizar Cantidad**
```sql
-- Para naves
UPDATE planet_ships
SET quantity = quantity + p_quantity
WHERE planet_id = p_planet_id
  AND ship_type_id = p_type_id;

-- Para defensas
UPDATE planet_defenses
SET quantity = quantity + p_quantity
WHERE planet_id = p_planet_id
  AND defense_type_id = p_type_id;
```

---

## Cancelacion de Construccion

### Reglas

1. Solo se puede cancelar el item actual en construccion
2. Se devuelve el 100% de recursos de las unidades NO construidas
3. Unidades ya construidas no se devuelven

### Calculo de Devolucion

```
tiempo_transcurrido = now() - start_time
unidades_completadas = floor(tiempo_transcurrido / tiempo_por_unidad)
unidades_restantes = cantidad_total - unidades_completadas

devolucion_metal = costo_metal * unidades_restantes
devolucion_cristal = costo_cristal * unidades_restantes
devolucion_deuterio = costo_deuterio * unidades_restantes
```

### Proceso

```
1. Calcular unidades completadas
2. Agregar unidades completadas al planeta
3. Calcular devolucion de unidades no iniciadas
4. Devolver recursos
5. Eliminar item de cola
6. Avanzar siguiente item
```

---

## Satelites Solares - Caso Especial

### Destruccion en Combate

Los satelites solares pueden ser destruidos en combates, lo que afecta la produccion de energia.

```
Si satelites destruidos:
    Recalcular energia disponible
    Si energia < consumo:
        Reducir produccion proporcionalmente
```

### Impacto de Temperatura

```
energia_por_satelite = (temp_maxima + 160) / 6
```

Planetas calientes (posiciones 1-3) generan mas energia por satelite.

---

## Completar con FXU (Instantaneo)

### Formula de Costo FXU

```
costo_recursos = (costo_metal + costo_cristal + costo_deuterio) * cantidad_restante
costo_fxu = (costo_recursos / ratio_fxu_naves) * factor_tiempo_restante
```

**Ratio por defecto:** 8000 (mas caro que edificios e investigacion)

### Proceso

```
1. Calcular unidades restantes por construir
2. Calcular costo FXU
3. Verificar balance FXU
4. Descontar FXU
5. Completar todas las unidades
6. Actualizar puntos
7. Registrar transaccion
8. Contribuir al jackpot
```

---

## Funcion RPC: secure_add_to_shipyard_queue

### Parametros

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| p_planet_id | UUID | Planeta con astillero |
| p_item_type | TEXT | 'ship' o 'defense' |
| p_type_id | TEXT | ID del tipo de nave/defensa |
| p_quantity | INTEGER | Cantidad a construir |

### Logica Completa

```
1. Verificar usuario autenticado
2. Verificar planeta pertenece al usuario
3. Verificar usuario no en modo vacaciones
4. Verificar astillero existe y nivel suficiente
5. Obtener datos de la nave/defensa
6. Verificar requisitos
7. Calcular costo total
8. Sincronizar y verificar recursos
9. Descontar recursos
10. Calcular tiempo con astillero y nanobots
11. Insertar en shipyard_queue
12. Retornar datos del nuevo item
```

### Retorno

```json
{
  "success": true,
  "queue_id": "uuid",
  "item_type": "ship",
  "type_id": "cruiser",
  "quantity": 10,
  "start_time": "2024-01-01T10:00:00Z",
  "end_time": "2024-01-01T11:30:00Z",
  "cost_metal": 200000,
  "cost_crystal": 70000,
  "cost_deuterium": 20000
}
```

---

## Consideraciones de Seguridad

### RLS para planet_ships

```sql
CREATE POLICY "Users can view own ships"
  ON planet_ships FOR SELECT
  TO authenticated
  USING (
    planet_id IN (SELECT id FROM planets WHERE user_id = auth.uid())
  );
```

### Validaciones Criticas

1. **Validar cantidad positiva** - quantity > 0
2. **Validar requisitos en backend** - Nunca confiar en cliente
3. **Usar transacciones** para atomicidad
4. **Bloquear filas** durante procesamiento
5. **Verificar propiedad** siempre
6. **Recalcular costos** en backend, no usar valores del cliente
