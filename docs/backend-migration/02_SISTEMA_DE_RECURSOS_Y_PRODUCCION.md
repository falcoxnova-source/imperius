# Sistema de Recursos y Produccion - Documentacion de Migracion Backend

## Descripcion General

El sistema de recursos es la economia base del juego. Existen tres recursos principales (Metal, Cristal, Deuterio) y dos recursos especiales (Energia, Materia Oscura). La produccion se calcula por hora y depende del nivel de los edificios de mineria.

---

## Tipos de Recursos

### Recursos Principales

| Recurso | Uso Principal | Produccion Base/Hora |
|---------|---------------|---------------------|
| Metal | Construccion basica | 30 |
| Cristal | Electronica y tecnologia | 15 |
| Deuterio | Combustible y tecnologia avanzada | 0 |

### Recursos Especiales

| Recurso | Descripcion | Obtencion |
|---------|-------------|-----------|
| Energia | Alimenta minas y edificios | Planta Solar, Reactor de Fusion, Satelites |
| Materia Oscura | Premium, oficiales | Expediciones, Compra |
| FXU | Moneda del juego | Depositos, Mercado |

---

## Formulas de Produccion

### 1. Produccion de Metal

**Formula:**
```
produccion_hora = 30 * nivel * (1.1)^nivel * velocidad_recursos
```

**Con bonus de Geologo (oficial):**
```
produccion_final = produccion_hora * 1.10
```

### 2. Produccion de Cristal

**Formula:**
```
produccion_hora = 20 * nivel * (1.1)^nivel * velocidad_recursos
```

**Con bonus de Geologo:**
```
produccion_final = produccion_hora * 1.10
```

### 3. Produccion de Deuterio

**Formula:**
```
factor_temperatura = 1.36 - 0.004 * temp_maxima
produccion_hora = 10 * nivel * (1.1)^nivel * factor_temperatura * velocidad_recursos
```

**Nota:** Planetas mas frios (posiciones 13-15) producen mas deuterio.

**Con bonus de Geologo:**
```
produccion_final = produccion_hora * 1.10
```

---

## Sistema de Energia

### Consumo de Energia

**Mina de Metal:**
```
consumo = 10 * nivel * (1.1)^nivel
```

**Mina de Cristal:**
```
consumo = 10 * nivel * (1.1)^nivel
```

**Sintetizador de Deuterio:**
```
consumo = 20 * nivel * (1.1)^nivel
```

### Produccion de Energia

**Planta Solar:**
```
produccion = 20 * nivel * (1.1)^nivel
```

**Reactor de Fusion:**
```
produccion = 30 * nivel * (1.05 + nivel_tecnologia_energia * 0.01)^nivel
```

**Consumo de deuterio del Reactor:**
```
consumo_deuterio = 10 * nivel * (1.1)^nivel por hora
```

**Satelite Solar:**
```
energia_por_satelite = (temp_maxima + 160) / 6
```

**Con bonus de Ingeniero:**
```
energia_total = energia_producida * 1.10
```

### Calculo del Factor de Energia

**Formula:**
```
energia_total = planta_solar + reactor_fusion + (satelites * energia_por_satelite)
energia_consumida = consumo_metal + consumo_cristal + consumo_deuterio

Si energia_total >= energia_consumida:
    factor_energia = 1.0
Si no:
    factor_energia = energia_total / energia_consumida
```

**Impacto en produccion:**
```
produccion_real = produccion_base * factor_energia
```

---

## Sistema de Almacenamiento

### Formula de Capacidad

```
capacidad = 5000 * floor(2.5 * exp((20 * nivel) / 33))
```

**Tabla de capacidades por nivel:**

| Nivel | Capacidad |
|-------|-----------|
| 0 | 10,000 |
| 1 | 22,500 |
| 2 | 37,500 |
| 3 | 57,500 |
| 4 | 85,000 |
| 5 | 122,500 |
| 6 | 172,500 |
| 7 | 240,000 |
| 8 | 330,000 |
| 9 | 450,000 |
| 10 | 610,000 |

### Comportamiento al Alcanzar Limite

- La produccion se detiene al alcanzar la capacidad maxima
- Los recursos no se pierden, simplemente dejan de acumularse
- Las operaciones que superen la capacidad se rechazan

---

## Proceso de Calculo de Recursos (Backend)

### Paso 1: Obtener Datos del Planeta

```
1. Consultar planet_resources para obtener recursos actuales y last_update
2. Consultar planet_buildings para obtener niveles de minas
3. Consultar user_technologies para obtener niveles de tecnologia
4. Consultar user_officers para obtener bonus activos
5. Consultar game_settings para obtener velocidad de recursos
```

### Paso 2: Calcular Tiempo Transcurrido

```
tiempo_transcurrido_horas = (now() - last_update) / 3600
```

### Paso 3: Calcular Produccion por Hora

```
// Obtener niveles de edificios
nivel_metal = nivel de Mina de Metal
nivel_cristal = nivel de Mina de Cristal
nivel_deuterio = nivel de Sintetizador de Deuterio
nivel_planta = nivel de Planta Solar
nivel_fusion = nivel de Reactor de Fusion
cantidad_satelites = cantidad de Satelites Solares

// Calcular energia
energia_planta = 20 * nivel_planta * (1.1)^nivel_planta
energia_fusion = 30 * nivel_fusion * (1.05 + nivel_tech_energia * 0.01)^nivel_fusion
energia_satelites = cantidad_satelites * ((temp_max + 160) / 6)

// Aplicar bonus Ingeniero si activo
Si ingeniero_activo:
    energia_total = (energia_planta + energia_fusion + energia_satelites) * 1.10
Si no:
    energia_total = energia_planta + energia_fusion + energia_satelites

// Calcular consumo
consumo_metal = 10 * nivel_metal * (1.1)^nivel_metal
consumo_cristal = 10 * nivel_cristal * (1.1)^nivel_cristal
consumo_deuterio = 20 * nivel_deuterio * (1.1)^nivel_deuterio
consumo_total = consumo_metal + consumo_cristal + consumo_deuterio

// Factor de energia
Si energia_total >= consumo_total:
    factor_energia = 1.0
Si no:
    factor_energia = energia_total / consumo_total

// Produccion base
prod_metal = 30 * nivel_metal * (1.1)^nivel_metal * factor_energia
prod_cristal = 20 * nivel_cristal * (1.1)^nivel_cristal * factor_energia
prod_deuterio = 10 * nivel_deuterio * (1.1)^nivel_deuterio * (1.36 - 0.004 * temp_max) * factor_energia

// Aplicar bonus Geologo si activo
Si geologo_activo:
    prod_metal = prod_metal * 1.10
    prod_cristal = prod_cristal * 1.10
    prod_deuterio = prod_deuterio * 1.10

// Aplicar velocidad del servidor
prod_metal = prod_metal * velocidad_recursos
prod_cristal = prod_cristal * velocidad_recursos
prod_deuterio = prod_deuterio * velocidad_recursos
```

### Paso 4: Calcular Recursos Generados

```
metal_generado = prod_metal * tiempo_transcurrido_horas
cristal_generado = prod_cristal * tiempo_transcurrido_horas
deuterio_generado = prod_deuterio * tiempo_transcurrido_horas

// Consumo de deuterio del Reactor de Fusion
consumo_fusion = 10 * nivel_fusion * (1.1)^nivel_fusion * tiempo_transcurrido_horas
deuterio_generado = deuterio_generado - consumo_fusion
```

### Paso 5: Aplicar Limites de Almacenamiento

```
capacidad_metal = calcular_capacidad(nivel_almacen_metal)
capacidad_cristal = calcular_capacidad(nivel_almacen_cristal)
capacidad_deuterio = calcular_capacidad(nivel_almacen_deuterio)

metal_nuevo = min(metal_actual + metal_generado, capacidad_metal)
cristal_nuevo = min(cristal_actual + cristal_generado, capacidad_cristal)
deuterio_nuevo = max(0, min(deuterio_actual + deuterio_generado, capacidad_deuterio))
```

### Paso 6: Actualizar Base de Datos

```sql
UPDATE planet_resources
SET
  metal = metal_nuevo,
  crystal = cristal_nuevo,
  deuterium = deuterio_nuevo,
  last_update = now()
WHERE planet_id = p_planet_id;
```

---

## Funcion RPC: calculate_and_sync_resources

### Proposito

Calcular y sincronizar recursos para un planeta, actualizando la base de datos con los valores calculados.

### Parametros de Entrada

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| p_planet_id | UUID | ID del planeta a sincronizar |

### Logica Interna

1. Verificar que el planeta existe y pertenece al usuario autenticado
2. Obtener timestamp de ultima actualizacion
3. Calcular tiempo transcurrido
4. Obtener niveles de edificios de produccion
5. Obtener niveles de tecnologias relevantes
6. Verificar oficiales activos
7. Aplicar todas las formulas descritas arriba
8. Actualizar planet_resources con nuevos valores
9. Retornar nuevos valores de recursos

### Retorno

```json
{
  "metal": 125000,
  "crystal": 87500,
  "deuterium": 43200,
  "energy_available": 1500,
  "energy_used": 1200,
  "production_metal": 1250,
  "production_crystal": 875,
  "production_deuterium": 432
}
```

---

## Sincronizacion Cliente-Servidor

### Estrategia de Sincronizacion

1. **Cliente calcula localmente** para UI responsiva
2. **Servidor es autoritativo** - todos los gastos validan en backend
3. **Sincronizacion periodica** cada 10 segundos
4. **Sincronizacion forzada** al:
   - Iniciar construccion
   - Enviar flota
   - Comprar en mercado
   - Cambiar de planeta

### Funcion RPC: full_reconnect_sync

**Proposito:** Sincronizacion completa al reconectar

**Logica:**
1. Procesar todas las colas de construccion completadas
2. Procesar todas las investigaciones completadas
3. Procesar todos los items de astillero completados
4. Calcular y sincronizar recursos
5. Procesar flotas que hayan llegado
6. Retornar estado completo del juego

---

## Validaciones de Recursos

### Al Gastar Recursos

```
Si metal_requerido > metal_actual O
   cristal_requerido > cristal_actual O
   deuterio_requerido > deuterio_actual:

   ERROR: "Recursos insuficientes"
```

### Al Recibir Recursos

```
metal_nuevo = min(metal_actual + metal_recibido, capacidad_metal)
cristal_nuevo = min(cristal_actual + cristal_recibido, capacidad_cristal)
deuterio_nuevo = min(deuterio_actual + deuterio_recibido, capacidad_deuterio)
```

**Nota:** El exceso de recursos sobre la capacidad se pierde.

---

## Consideraciones de Seguridad

### RLS para planet_resources

```sql
-- Solo el propietario puede ver recursos de sus planetas
CREATE POLICY "Users can view own planet resources"
  ON planet_resources FOR SELECT
  TO authenticated
  USING (
    planet_id IN (
      SELECT id FROM planets WHERE user_id = auth.uid()
    )
  );

-- Solo funciones del backend pueden modificar recursos
-- Los usuarios NO tienen permisos de UPDATE/INSERT directos
```

### Validaciones Criticas

1. **Nunca confiar en valores del cliente** para recursos
2. **Siempre recalcular en backend** antes de gastar
3. **Usar transacciones** para operaciones atomicas
4. **Verificar capacidad** antes de depositar recursos
5. **Verificar recursos suficientes** antes de cualquier gasto

---

## Tabla de Referencia: Produccion por Nivel

### Mina de Metal (velocidad x1)

| Nivel | Produccion/Hora | Consumo Energia |
|-------|-----------------|-----------------|
| 1 | 33 | 11 |
| 5 | 215 | 72 |
| 10 | 698 | 234 |
| 15 | 1,961 | 657 |
| 20 | 5,257 | 1,762 |
| 25 | 13,675 | 4,583 |
| 30 | 34,874 | 11,689 |

### Mina de Cristal (velocidad x1)

| Nivel | Produccion/Hora | Consumo Energia |
|-------|-----------------|-----------------|
| 1 | 22 | 11 |
| 5 | 143 | 72 |
| 10 | 465 | 234 |
| 15 | 1,307 | 657 |
| 20 | 3,505 | 1,762 |
| 25 | 9,117 | 4,583 |
| 30 | 23,249 | 11,689 |

### Sintetizador de Deuterio (temp 50C, velocidad x1)

| Nivel | Produccion/Hora | Consumo Energia |
|-------|-----------------|-----------------|
| 1 | 12 | 22 |
| 5 | 79 | 143 |
| 10 | 257 | 465 |
| 15 | 722 | 1,307 |
| 20 | 1,936 | 3,505 |
| 25 | 5,034 | 9,117 |
| 30 | 12,841 | 23,249 |
