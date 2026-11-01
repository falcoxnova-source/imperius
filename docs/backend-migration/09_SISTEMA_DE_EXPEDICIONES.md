# Sistema de Expediciones - Documentacion de Migracion Backend

## Descripcion General

Las expediciones permiten a los jugadores enviar flotas a explorar el espacio desconocido (posicion 16 de cualquier sistema). Las expediciones pueden resultar en encontrar recursos, materia oscura, naves abandonadas, o en casos raros, perder la flota. Es una mecanica de riesgo-recompensa.

---

## Requisitos para Expediciones

### Tecnologia Requerida

**Astrofisica** determina:
- Cantidad de slots de expedicion
- Duracion maxima de expediciones

### Slots de Expedicion

```
slots_expedicion = floor(sqrt(nivel_astrofisica))
```

| Nivel Astrofisica | Slots |
|-------------------|-------|
| 1 | 1 |
| 4 | 2 |
| 9 | 3 |
| 16 | 4 |
| 25 | 5 |

### Duracion Maxima

```
duracion_maxima_horas = min(20, 1 + floor(nivel_astrofisica / 3))
```

| Nivel Astrofisica | Duracion Max |
|-------------------|--------------|
| 1-2 | 1 hora |
| 3-5 | 2 horas |
| 6-8 | 3 horas |
| 9-11 | 4 horas |
| ... | ... |
| 57+ | 20 horas |

---

## Proceso de Envio de Expedicion

### Paso 1: Validaciones

```
1. Verificar slots de expedicion disponibles
2. Verificar destino es posicion 16
3. Verificar NO hay sondas de espionaje en la flota
   (Las sondas no reciben recompensas)
4. Calcular capacidad de carga de la flota
5. Verificar combustible suficiente
```

### Paso 2: Calcular Tiempo

```
tiempo_vuelo = formula_tiempo_vuelo_normal
tiempo_expedicion = duracion_seleccionada_por_usuario (1 a duracion_max)
tiempo_total_ida = tiempo_vuelo + tiempo_expedicion
```

### Paso 3: Enviar Flota

```sql
INSERT INTO fleets (
  user_id, origin_planet_id,
  target_galaxy, target_system, target_position,
  mission, speed_percent,
  departure_time, arrival_time,
  expedition_duration, status
) VALUES (
  user_id, planet_id,
  galaxy, system, 16,
  'expedition', velocidad,
  now(), now() + tiempo_ida,
  duracion_expedicion, 'traveling'
);
```

---

## Resultados de Expedicion

### Tipos de Resultado

Se genera UN solo resultado aleatorio del 100%. No hay tiradas separadas para "bueno" o "malo".

| Tipo | Probabilidad | Categoria | Descripcion |
|------|--------------|-----------|-------------|
| resources | 30% | Positivo | Encontrar recursos |
| dark_matter | 15% | Positivo | Encontrar materia oscura |
| ships | 10% | Positivo | Encontrar naves abandonadas |
| merchant | 5% | Positivo | Comerciante (ofertas especiales) |
| nothing | 30% | Neutro | No encontrar nada |
| pirates | 7% | Negativo | Ataque pirata (perdida parcial) |
| black_hole | 3% | Negativo | Agujero negro (perdida total) |

**Total: 100%** (30 + 15 + 10 + 5 + 30 + 7 + 3 = 100)

### Logica de Seleccion

```
numero_aleatorio = random(1, 100)

Si numero <= 30: resultado = 'resources'
Si numero <= 45: resultado = 'dark_matter'    (30 + 15)
Si numero <= 55: resultado = 'ships'          (45 + 10)
Si numero <= 60: resultado = 'merchant'       (55 + 5)
Si numero <= 90: resultado = 'nothing'        (60 + 30)
Si numero <= 97: resultado = 'pirates'        (90 + 7)
Si numero <= 100: resultado = 'black_hole'    (97 + 3)
```

### Resumen de Probabilidades

- **Positivos (60%):** resources + dark_matter + ships + merchant
- **Neutro (30%):** nothing
- **Negativos (10%):** pirates + black_hole

---

## Calculo de Recompensas

### Recursos Encontrados

**Formula Base:**
```
metal_encontrado = random(1000, 5000) * factor_expedicion
cristal_encontrado = random(500, 3000) * factor_expedicion
deuterio_encontrado = random(100, 1000) * factor_expedicion
```

**Factor de Expedicion:**
```
factor_expedicion = 1 + (duracion_horas * 0.1) + (nivel_astrofisica * 0.05)
```

**Limite por Capacidad:**
```
total_encontrado = metal + cristal + deuterio
Si total_encontrado > capacidad_flota:
    Escalar proporcionalmente para que quepa
```

### Materia Oscura

```
materia_oscura = random(100, 500) * (1 + nivel_astrofisica * 0.1)
```

### Naves Encontradas

```
naves_posibles = ['small_cargo', 'large_cargo', 'light_fighter',
                  'heavy_fighter', 'cruiser', 'recycler', 'pathfinder']

tipo_nave = random(naves_posibles)
cantidad = random(1, 10) * (1 + nivel_astrofisica * 0.05)
```

**Restriccion:** Solo se pueden encontrar naves que el jugador ya ha desbloqueado.

---

## Eventos Negativos

### Ataque Pirata

```
perdidas = random(10%, 30%) de la flota

Para cada tipo de nave en flota:
    cantidad_perdida = floor(cantidad * perdidas)
    cantidad_restante = cantidad - cantidad_perdida
```

### Agujero Negro

```
// La flota completa se pierde
// Muy raro (2%)
// No hay recursos saqueados
// No hay escombros
```

---

## Sistema de Pool de Expedicion

### Contribucion al Pool

Cada expedicion exitosa contribuye al pool de expedicion:

```
contribucion = recompensa_fxu * porcentaje_pool
```

**Porcentaje por defecto:** 5%

### Jackpot de Expedicion

Los jugadores pueden ganar el pool acumulado:

```
probabilidad_jackpot = 0.1% por expedicion
Si random() < 0.001:
    jugador gana el pool completo
    pool se reinicia a 0
```

---

## Proceso de Llegada de Expedicion

### Funcion: process_expedition_arrival

```
1. Obtener datos de la flota
2. Generar resultado aleatorio
3. Segun tipo de resultado:

   Si 'resources':
       calcular_recursos()
       cargar_en_flota()

   Si 'dark_matter':
       calcular_materia_oscura()
       agregar_a_perfil()

   Si 'ships':
       calcular_naves_encontradas()
       agregar_a_flota()

   Si 'pirates':
       calcular_perdidas()
       aplicar_perdidas()

   Si 'black_hole':
       destruir_flota()
       notificar_jugador()
       return

   Si 'nothing':
       // No hacer nada

4. Contribuir al pool si hay recompensa
5. Verificar jackpot
6. Iniciar viaje de retorno
7. Crear reporte de expedicion
```

---

## Expediciones con Exploradores

### Bonus de Explorador

La nave Explorador (Pathfinder) mejora los resultados:

```
bonus_explorador = 1 + (cantidad_exploradores * 0.10)
recompensa_final = recompensa_base * bonus_explorador
```

**Maximo bonus:** 50% (con 5+ exploradores)

### Proteccion contra Perdida

Los Exploradores reducen la probabilidad de eventos negativos:

```
Si flota tiene exploradores:
    probabilidad_piratas = probabilidad_base * 0.5
    probabilidad_agujero_negro = probabilidad_base * 0.25
```

---

## Restriccion de Sondas de Espionaje

### Regla

Las sondas de espionaje NO reciben recompensas en expediciones:

```
Si flota contiene SOLO sondas de espionaje:
    ERROR: "Las sondas no pueden hacer expediciones"

Si flota contiene sondas + otras naves:
    Las sondas viajan pero no afectan recompensas
    Solo se cuenta capacidad de otras naves
```

### Justificacion

Evitar que jugadores abusen de la alta velocidad de las sondas para hacer expediciones rapidas sin riesgo.

---

## Tarifa de Expedicion (FXU)

### Tarifa Extra

Las expediciones pueden tener una tarifa adicional en FXU:

```
tarifa_expedicion = obtener_de_configuracion()

Si tarifa_expedicion > 0:
    Verificar balance FXU del jugador
    Descontar FXU
    Registrar como ingreso de administrador
```

**Por defecto:** 0 FXU (sin tarifa)

---

## Tabla: expedition_results

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico |
| fleet_id | UUID | ID de la flota |
| user_id | UUID | Propietario |
| result_type | TEXT | Tipo de resultado |
| metal_found | NUMERIC | Metal encontrado |
| crystal_found | NUMERIC | Cristal encontrado |
| deuterium_found | NUMERIC | Deuterio encontrado |
| dark_matter_found | INTEGER | Materia oscura |
| ships_found | JSONB | Naves encontradas |
| ships_lost | JSONB | Naves perdidas |
| jackpot_won | BOOLEAN | Si gano jackpot |
| jackpot_amount | NUMERIC | Cantidad de jackpot |
| created_at | TIMESTAMP | Timestamp |

---

## Reporte de Expedicion

### Estructura del Mensaje

```json
{
  "type": "expedition_report",
  "fleet_id": "uuid",
  "coordinates": "[1:100:16]",
  "duration": 5,
  "result": "resources",
  "findings": {
    "metal": 25000,
    "crystal": 15000,
    "deuterium": 5000
  },
  "fleet_status": "returning",
  "timestamp": "2024-01-01T15:00:00Z"
}
```

### Mensajes por Tipo

**Recursos:**
```
"Tu flota ha encontrado un asteroide rico en recursos.
Tus naves han recogido 25,000 metal, 15,000 cristal y 5,000 deuterio."
```

**Materia Oscura:**
```
"Tu flota ha descubierto una anomalia espacial y ha recolectado
250 unidades de materia oscura."
```

**Naves:**
```
"Tu flota ha encontrado 5 Cargueros Grandes abandonados en
perfecto estado. Se han unido a tu flota."
```

**Piratas:**
```
"Tu flota fue emboscada por piratas espaciales.
Perdiste 3 Cazas Ligeros y 1 Crucero en el combate."
```

**Agujero Negro:**
```
"Tu flota fue atrapada en un agujero negro.
Todas las naves y tripulacion se han perdido."
```

**Nada:**
```
"Tu flota exploro el sector pero no encontro nada de interes.
Regresa a casa con las manos vacias."
```

---

## Consideraciones de Seguridad

### Validaciones

1. **Verificar slots disponibles** en backend
2. **Verificar posicion 16** siempre
3. **Generar resultados en backend** nunca en cliente
4. **Usar RNG criptografico** para resultados
5. **Registrar todos los resultados** para auditoria

### RLS

```sql
CREATE POLICY "Users can view own expedition results"
  ON expedition_results FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
```

### Anti-Abuso

1. **Limite de slots** basado en astrofisica
2. **No sondas solas** para evitar spam
3. **Tarifa opcional** para balancear economia
4. **Eventos negativos** para riesgo real
