# Sistema de Flotas - Documentacion de Migracion Backend

## Descripcion General

El sistema de flotas permite a los jugadores enviar sus naves a realizar misiones en el universo. Las flotas pueden atacar, transportar recursos, colonizar, espiar, reciclar escombros y realizar expediciones. El calculo de tiempos de vuelo y consumo de combustible es fundamental para la estrategia del juego.

---

## Tipos de Misiones

| ID | Nombre | Descripcion |
|----|--------|-------------|
| attack | Ataque | Atacar planeta enemigo |
| transport | Transporte | Enviar recursos a otro planeta |
| deploy | Desplegar | Estacionar flota temporalmente |
| colonize | Colonizar | Crear nueva colonia |
| espionage | Espionaje | Espiar planeta enemigo |
| recycle | Reciclar | Recolectar campo de escombros |
| destroy | Destruir | Destruir luna |
| expedition | Expedicion | Explorar posicion 16 |
| hold | Mantener | Esperar para ACS |

---

## Formulas de Distancia

### Entre Galaxias Diferentes

```
distancia = abs(galaxia1 - galaxia2) * 20000
```

### Misma Galaxia, Diferente Sistema

```
distancia = abs(sistema1 - sistema2) * 95 + 2700
```

### Mismo Sistema, Diferente Posicion

```
distancia = abs(posicion1 - posicion2) * 5 + 1000
```

### Misma Posicion (planeta a luna)

```
distancia = 5
```

### Ejemplos

**De [1:100:5] a [3:100:5]:**
```
distancia = abs(1 - 3) * 20000 = 40000
```

**De [1:100:5] a [1:250:5]:**
```
distancia = abs(100 - 250) * 95 + 2700 = 16950
```

**De [1:100:5] a [1:100:10]:**
```
distancia = abs(5 - 10) * 5 + 1000 = 1025
```

---

## Formula de Tiempo de Vuelo

### Formula General

```
velocidad_efectiva = velocidad_nave_mas_lenta_con_bonus_tecnologia
tiempo_segundos = max(10, round((35000 / (porcentaje_velocidad / 100) * sqrt(distancia * 10 / velocidad_efectiva) + 10) / velocidad_flota_servidor))
```

### Porcentaje de Velocidad

El jugador puede elegir entre 10% y 100% de velocidad (en incrementos de 10%):
- 10%: Mas lento, menos combustible
- 100%: Mas rapido, mas combustible

### Velocidad de la Flota

La velocidad de la flota es la de la nave mas lenta:

```
velocidad_flota = min(velocidad_nave1, velocidad_nave2, ..., velocidad_naveN)
```

### Ejemplo de Calculo

**Flota con Cruceros (velocidad 39000 con Impulso 8) a distancia 16950:**
```
tiempo = (35000 / 1.0) * sqrt(16950 * 10 / 39000) + 10
tiempo = 35000 * sqrt(4.346) + 10
tiempo = 35000 * 2.085 + 10
tiempo = 72985 segundos / velocidad_servidor
```

---

## Formula de Consumo de Combustible

### Formula General

```
consumo_total = suma de (consumo_nave * cantidad * factor_distancia * factor_velocidad)
```

**Por nave:**
```
consumo_nave = consumo_base * cantidad * (distancia / 35000) * ((porcentaje_velocidad / 100) + 1)
```

### Ejemplo

**10 Cruceros (consumo base 300) a distancia 16950, velocidad 100%:**
```
consumo = 300 * 10 * (16950 / 35000) * (1 + 1)
consumo = 3000 * 0.484 * 2
consumo = 2904 deuterio
```

---

## Capacidad de Carga

### Capacidad Total de la Flota

```
capacidad_total = suma de (capacidad_nave * cantidad)
```

### Limites de Carga

```
metal_cargado <= capacidad_total
cristal_cargado <= capacidad_total
deuterio_cargado <= capacidad_total - combustible_vuelta
(metal + cristal + deuterio) <= capacidad_total
```

**Importante:** Siempre reservar deuterio suficiente para el viaje de vuelta.

---

## Slots de Flota

### Calculo de Slots Disponibles

```
slots_base = 1 + nivel_computacion
slots_almirante = 2 (si oficial activo)
slots_totales = slots_base + slots_almirante
```

### Flotas en Uso

```
flotas_en_vuelo = contar flotas con status != 'returned'
slots_disponibles = slots_totales - flotas_en_vuelo
```

---

## Proceso de Envio de Flota

### Funcion: secure_send_fleet

**Paso 1: Validaciones Iniciales**
```
1. Verificar usuario autenticado
2. Verificar planeta origen pertenece al usuario
3. Verificar usuario no en modo vacaciones
4. Verificar slots de flota disponibles
5. Verificar naves suficientes en planeta origen
```

**Paso 2: Validaciones de Mision**
```
Si mision == 'colonize':
    Verificar nave colonizadora en flota
    Verificar slots de colonia disponibles
    Verificar coordenadas destino libres

Si mision == 'attack':
    Verificar destino no es propio
    Verificar destino no en modo vacaciones
    Verificar proteccion noob
    Verificar regla anti-bashing

Si mision == 'espionage':
    Verificar sondas de espionaje en flota
    Verificar destino no es propio

Si mision == 'recycle':
    Verificar recicladores en flota
    Verificar existe campo de escombros

Si mision == 'expedition':
    Verificar slots de expedicion disponibles
    Verificar posicion destino == 16
    Verificar NO hay sondas de espionaje (no reciben recompensas)
```

**Paso 3: Calcular Viaje**
```
1. Calcular distancia
2. Determinar nave mas lenta
3. Calcular tiempo de vuelo
4. Calcular consumo de combustible
5. Verificar deuterio suficiente
```

**Paso 4: Validar Carga**
```
Si carga_total > capacidad_total:
    ERROR: "Carga excede capacidad"

Si deuterio_cargado + combustible > deuterio_planeta:
    ERROR: "Deuterio insuficiente"
```

**Paso 5: Ejecutar Envio**
```sql
-- Descontar naves del planeta
UPDATE planet_ships
SET quantity = quantity - cantidad_enviada
WHERE planet_id = p_planet_id
  AND ship_type_id = tipo_nave;

-- Descontar recursos de carga
UPDATE planet_resources
SET
  metal = metal - metal_cargado,
  crystal = crystal - cristal_cargado,
  deuterium = deuterium - deuterio_cargado - combustible
WHERE planet_id = p_planet_id;

-- Crear flota
INSERT INTO fleets (
  user_id, origin_planet_id, target_galaxy, target_system, target_position,
  mission, speed_percent, metal, crystal, deuterium,
  departure_time, arrival_time, return_time, status
) VALUES (...);

-- Insertar naves de la flota
INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity) VALUES (...);
```

---

## Proceso de Llegada de Flota

### Funcion: process_fleet_arrival

**Mecanismo Anti-Doble-Procesamiento:**
```sql
SELECT * FROM fleets
WHERE arrival_time <= now()
  AND status = 'traveling'
FOR UPDATE SKIP LOCKED;
```

**Procesamiento por Tipo de Mision:**

### Mision: Attack
```
1. Obtener naves y defensas del defensor
2. Ejecutar simulacion de combate
3. Calcular escombros
4. Calcular botin
5. Actualizar naves/defensas del defensor
6. Aplicar reconstruccion de defensas (70%)
7. Crear campo de escombros si necesario
8. Crear luna si aplica
9. Cargar botin en flota
10. Crear reporte de batalla
11. Notificar a ambos jugadores
12. Iniciar viaje de retorno
```

### Mision: Transport
```
1. Depositar recursos en planeta destino
2. Si destino es propio: iniciar retorno
3. Si destino es ajeno: transferir sin retorno (naves perdidas)
```

### Mision: Deploy
```
1. Transferir naves al planeta destino
2. Depositar recursos
3. Flota no retorna (se queda)
```

### Mision: Colonize
```
1. Verificar coordenadas aun libres
2. Crear nuevo planeta
3. Destruir nave colonizadora
4. Depositar recursos restantes
5. Iniciar retorno con naves restantes
6. Notificar al jugador
```

### Mision: Espionage
```
1. Calcular diferencia de espionaje
2. Determinar informacion visible
3. Calcular probabilidad de deteccion
4. Si detectado: destruir sondas
5. Crear reporte de espionaje
6. Notificar al defensor
7. Iniciar retorno
```

### Mision: Recycle
```
1. Obtener recursos del campo de escombros
2. Cargar hasta capacidad
3. Actualizar/eliminar campo de escombros
4. Iniciar retorno
```

### Mision: Expedition
```
1. Calcular tiempo de expedicion
2. Generar resultado aleatorio
3. Posibles resultados:
   - Recursos encontrados
   - Materia oscura encontrada
   - Naves encontradas
   - Nada encontrado
   - Flota perdida (muy raro)
4. Cargar recompensas
5. Contribuir al pool de expedicion
6. Iniciar retorno
```

---

## Sistema de Retorno

### Calculo de Tiempo de Retorno

```
tiempo_retorno = tiempo_llegada + tiempo_vuelo_original
```

### Proceso de Retorno

```
1. Cuando arrival_time se alcanza en el retorno:
2. Depositar naves en planeta origen
3. Depositar recursos cargados
4. Marcar flota como 'returned'
5. Liberar slot de flota
```

---

## Cancelacion de Flota

### Reglas

1. Solo se puede cancelar flotas en vuelo de ida
2. Al cancelar, la flota retorna al 50% del camino recorrido
3. No se puede cancelar flotas que ya llegaron

### Formula de Tiempo de Retorno al Cancelar

```
tiempo_transcurrido = now() - departure_time
tiempo_retorno = departure_time + (tiempo_transcurrido * 2)
```

### Proceso

```
1. Verificar flota en status 'traveling'
2. Calcular nuevo tiempo de llegada
3. Actualizar coordenadas destino al planeta origen
4. Actualizar tiempos
5. Marcar flota como 'returning'
```

---

## Proteccion Noob

### Limites

```
limite_puntos_noob = 5000
ratio_maximo = 5
```

### Verificacion

```
puntos_atacante = obtener puntos del atacante
puntos_defensor = obtener puntos del defensor

// No atacar a novatos
Si defensor < limite_noob Y atacante >= limite_noob:
    ERROR: "No puedes atacar a jugadores en proteccion de novato"

// No atacar a jugadores mucho mas debiles
Si puntos_atacante / puntos_defensor > ratio_maximo:
    ERROR: "El defensor es demasiado debil"

// No atacar a jugadores mucho mas fuertes (proteccion inversa)
Si puntos_defensor / puntos_atacante > ratio_maximo Y defensor >= limite_noob:
    ERROR: "El defensor es demasiado fuerte"
```

---

## Regla Anti-Bashing

### Limite

```
ataques_maximos_24h = 6
```

### Verificacion

```
ataques_recientes = contar ataques del atacante al defensor en ultimas 24h

Si ataques_recientes >= 6:
    ERROR: "Has alcanzado el limite de ataques a este jugador"
```

---

## Aceleracion de Flota (FXU)

### Formula de Costo

```
tiempo_restante_minutos = (arrival_time - now()) / 60
costo_fxu_por_minuto = obtener_de_configuracion()
costo_total = tiempo_restante_minutos * costo_fxu_por_minuto
```

### Proceso

```
1. Verificar flota en vuelo
2. Calcular tiempo restante
3. Calcular costo FXU
4. Verificar balance
5. Descontar FXU
6. Procesar llegada inmediatamente
7. Contribuir al jackpot
```

---

## Tabla: fleets

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico |
| user_id | UUID | Propietario |
| origin_planet_id | UUID | Planeta de origen |
| target_galaxy | INTEGER | Galaxia destino |
| target_system | INTEGER | Sistema destino |
| target_position | INTEGER | Posicion destino |
| target_planet_id | UUID | Planeta destino (si existe) |
| mission | TEXT | Tipo de mision |
| speed_percent | INTEGER | Porcentaje de velocidad (10-100) |
| metal | NUMERIC | Metal cargado |
| crystal | NUMERIC | Cristal cargado |
| deuterium | NUMERIC | Deuterio cargado |
| departure_time | TIMESTAMP | Hora de salida |
| arrival_time | TIMESTAMP | Hora de llegada |
| return_time | TIMESTAMP | Hora de retorno |
| status | TEXT | 'traveling', 'returning', 'returned' |

---

## Tabla: fleet_ships

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico |
| fleet_id | UUID | ID de la flota |
| ship_type_id | TEXT | Tipo de nave |
| quantity | INTEGER | Cantidad |

---

## Consideraciones de Seguridad

### RLS para fleets

```sql
CREATE POLICY "Users can view own fleets"
  ON fleets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can view fleets targeting them"
  ON fleets FOR SELECT
  TO authenticated
  USING (
    target_planet_id IN (SELECT id FROM planets WHERE user_id = auth.uid())
  );
```

### Validaciones Criticas

1. **Usar FOR UPDATE SKIP LOCKED** para evitar doble procesamiento
2. **Validar propiedad de naves** siempre
3. **Validar mision permitida** para cada tipo
4. **Calcular combustible en backend** nunca confiar en cliente
5. **Verificar modo vacaciones** de ambos jugadores
6. **Aplicar reglas de proteccion** siempre
